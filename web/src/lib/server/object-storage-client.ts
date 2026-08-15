import { createReadStream } from "node:fs";

import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client, type ObjectIdentifier } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { assertObjectStorageConfigured, type ObjectStorageRuntimeConfig } from "@/lib/server/object-storage-config";

export type ObjectStorageListedObject = {
    key: string;
    bytes: number;
    lastModified?: string;
    etag?: string;
};

export function createObjectStorageClient(config: ObjectStorageRuntimeConfig) {
    assertObjectStorageConfigured(config);
    return new S3Client({
        region: config.region,
        endpoint: config.endpoint || undefined,
        forcePathStyle: config.forcePathStyle,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
    });
}

export async function testObjectStorageConnection(config: ObjectStorageRuntimeConfig) {
    const client = createObjectStorageClient(config);
    try {
        await client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: config.prefix ? `${config.prefix}/` : undefined, MaxKeys: 1 }));
    } finally {
        client.destroy();
    }
}

export async function putObjectBytes(config: ObjectStorageRuntimeConfig, input: { key: string; bytes: Buffer; contentType: string; metadata?: Record<string, string> }) {
    const client = createObjectStorageClient(config);
    try {
        await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: input.key, Body: input.bytes, ContentLength: input.bytes.length, ContentType: input.contentType, Metadata: input.metadata }));
    } finally {
        client.destroy();
    }
}

export async function putObjectFile(config: ObjectStorageRuntimeConfig, input: { key: string; filePath: string; bytes: number; contentType: string; metadata?: Record<string, string> }) {
    const client = createObjectStorageClient(config);
    try {
        await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: input.key, Body: createReadStream(input.filePath), ContentLength: input.bytes, ContentType: input.contentType, Metadata: input.metadata }));
    } finally {
        client.destroy();
    }
}

export async function objectExists(config: ObjectStorageRuntimeConfig, key: string) {
    const client = createObjectStorageClient(config);
    try {
        await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
        return true;
    } catch (error) {
        if (isMissingObjectError(error)) return false;
        throw error;
    } finally {
        client.destroy();
    }
}

export async function getObjectBytes(config: ObjectStorageRuntimeConfig, key: string) {
    const client = createObjectStorageClient(config);
    try {
        const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        if (!result.Body) throw new Error("外部存储对象没有可读取内容");
        return Buffer.from(await result.Body.transformToByteArray());
    } finally {
        client.destroy();
    }
}

export async function signObjectRead(config: ObjectStorageRuntimeConfig, input: { key: string; contentType?: string; contentDisposition?: string; expiresIn?: number }) {
    const client = createObjectStorageClient(config);
    try {
        return await getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: input.key, ResponseContentType: input.contentType, ResponseContentDisposition: input.contentDisposition }), {
            expiresIn: Math.max(60, Math.min(3600, input.expiresIn || 600)),
        });
    } finally {
        client.destroy();
    }
}

export async function listObjects(config: ObjectStorageRuntimeConfig, input: { prefix?: string; cursor?: string; limit?: number }) {
    const client = createObjectStorageClient(config);
    try {
        const result = await client.send(
            new ListObjectsV2Command({
                Bucket: config.bucket,
                Prefix: input.prefix,
                ContinuationToken: input.cursor || undefined,
                MaxKeys: Math.max(1, Math.min(100, input.limit || 30)),
            }),
        );
        return {
            items: (result.Contents || []).flatMap((item): ObjectStorageListedObject[] => (item.Key ? [{ key: item.Key, bytes: Number(item.Size) || 0, lastModified: item.LastModified?.toISOString(), etag: item.ETag?.replace(/^"|"$/g, "") }] : [])),
            nextCursor: result.IsTruncated ? result.NextContinuationToken : undefined,
        };
    } finally {
        client.destroy();
    }
}

export async function deleteObjects(config: ObjectStorageRuntimeConfig, keys: string[]) {
    const unique = Array.from(new Set(keys.map((key) => key.trim()).filter(Boolean)));
    if (!unique.length) return;
    const client = createObjectStorageClient(config);
    try {
        for (let offset = 0; offset < unique.length; offset += 1000) {
            const objects: ObjectIdentifier[] = unique.slice(offset, offset + 1000).map((Key) => ({ Key }));
            const result = await client.send(new DeleteObjectsCommand({ Bucket: config.bucket, Delete: { Objects: objects, Quiet: true } }));
            if (result.Errors?.length) throw new Error(result.Errors.map((error) => `${error.Key || "对象"}: ${error.Message || error.Code || "删除失败"}`).join("；"));
        }
    } finally {
        client.destroy();
    }
}

function isMissingObjectError(error: unknown) {
    if (!error || typeof error !== "object") return false;
    const value = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
    return value.name === "NotFound" || value.Code === "NoSuchKey" || value.$metadata?.httpStatusCode === 404;
}
