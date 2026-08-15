type ClipboardFileSource = Pick<DataTransfer, "files" | "items">;

export function clipboardImageFiles(source: ClipboardFileSource) {
    const itemFiles = Array.from(source.items || [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
    const files = itemFiles.length ? itemFiles : Array.from(source.files || []);
    return files.filter((file) => file.type.toLowerCase().startsWith("image/"));
}
