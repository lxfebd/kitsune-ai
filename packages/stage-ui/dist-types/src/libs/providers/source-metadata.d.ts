export type ProviderSourcePricing = 'free' | 'paid';
export type ProviderSourceDeployment = 'local' | 'cloud';
/**
 * Represents source catalogue tags used by provider filtering UI.
 */
export interface ProviderSourceMetadata {
    /** Price bucket shown by the provider source filter. */
    pricing?: ProviderSourcePricing;
    /** Runtime/deployment bucket shown by the provider source filter. */
    deployment?: ProviderSourceDeployment;
}
export interface ProviderSourceMetadataInput {
    id?: string;
}
/**
 * Resolves the provider source tags used by settings/provider filtering.
 *
 * Use when:
 * - Rendering provider source cards.
 * - Converting defineProvider() catalogue entries to legacy ProviderMetadata.
 *
 * Expects:
 * - `metadata.id` may identify a provider with catalogue metadata.
 *
 * Returns:
 * - Compact metadata with only meaningful tag fields.
 */
export declare function resolveProviderSourceMetadata(metadata?: ProviderSourceMetadataInput): ProviderSourceMetadata;
