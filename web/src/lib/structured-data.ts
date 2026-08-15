type WebsiteStructuredDataInput = {
    name: string;
    description: string;
    url: string;
    logoUrl: string;
};

type CreativeWorkStructuredDataInput = {
    visibility: "public" | "unlisted" | "private";
    url: string;
    websiteId: string;
    title: string;
    description: string;
    publishedAt: string;
    category: string;
    tags: string[];
    authorName?: string;
    imageUrl?: string;
};

export function serializeStructuredData(value: unknown) {
    return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function buildWebsiteStructuredData(input: WebsiteStructuredDataInput) {
    return {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": `${input.url}#website`,
        url: input.url,
        name: input.name,
        description: input.description,
        publisher: {
            "@type": "Organization",
            name: input.name,
            logo: { "@type": "ImageObject", url: input.logoUrl },
        },
    };
}

export function buildCreativeWorkStructuredData(input: CreativeWorkStructuredDataInput) {
    if (input.visibility !== "public") return null;
    return {
        "@context": "https://schema.org",
        "@type": "CreativeWork",
        "@id": `${input.url}#creative-work`,
        url: input.url,
        name: input.title,
        description: input.description,
        datePublished: input.publishedAt,
        genre: input.category,
        keywords: input.tags,
        ...(input.authorName ? { author: { "@type": "Person", name: input.authorName } } : {}),
        ...(input.imageUrl ? { image: input.imageUrl } : {}),
        isPartOf: { "@id": input.websiteId },
    };
}
