declare module 'pdf-parse' {
    const pdf: any;
    export default pdf;
}

declare module 'mammoth' {
    export function extractRawText(options: { buffer: Buffer }): Promise<{ value: string; messages: any[] }>;
}

