type AliyunQueryParams = Record<string, string>;
export interface CreateTokenOptions {
    regionId?: string;
    endpoint?: string;
    timestamp?: Date;
    signatureNonce?: string;
    extraQuery?: AliyunQueryParams;
}
export interface CreateTokenRequest {
    endpoint: string;
    canonicalQuery: string;
    stringToSign: string;
    signature: string;
    encodedSignature: string;
    signedQuery: string;
    params: AliyunQueryParams;
    url: string;
}
export declare function canonicalizeQuery(params: AliyunQueryParams): string;
export declare function createStringToSign(method: string, path: string, canonicalQuery: string): string;
export declare function signStringToBase64(stringToSign: string, accessKeySecret: string): Promise<string>;
export declare function buildCreateTokenRequest(accessKeyId: string, accessKeySecret: string, options?: CreateTokenOptions): Promise<CreateTokenRequest>;
export declare function createToken(accessKeyId: string, accessKeySecret: string, options?: CreateTokenOptions): Promise<{
    token: string;
    expiresAt: number;
}>;

