import { buildSearchText } from '../../utils/cleaning.js';

export function generateProductEmbeddingText(product) {
  return buildSearchText([
    product.product_name,
    product.hs_code_6_digit,
    product.itc_hs_8_digit,
    product.product_category,
    product.sector,
    product.description?.product_description,
    product.description?.itc_hs_description,
    product.policy?.export_policy
  ]);
}

export function generateCountryEmbeddingText(country) {
  return buildSearchText([
    country.country_name,
    country.iso_code,
    country.region,
    country.continent,
    country.trade_profile?.major_products_exported,
    country.trade_profile?.top_hs_chapters,
    country.trade_profile?.fta_trade_agreement_status
  ]);
}

export async function semanticProductSearch() {
  return {
    configured: false,
    results: [],
    message: 'Vector search is not configured. Falling back to keyword search.'
  };
}

export async function semanticCountrySearch() {
  return {
    configured: false,
    results: [],
    message: 'Vector search is not configured. Falling back to keyword search.'
  };
}
