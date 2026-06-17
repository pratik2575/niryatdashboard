export function validateProductInput(record) {
  const errors = [];

  if (!record.hs_chapter) errors.push('hs_chapter is required');
  if (!record.hs_code_6_digit) errors.push('hs_code_6_digit is required');
  if (!record.product_name) errors.push('product_name is required');
  if (record.hs_chapter && !/^\d{2}$/.test(record.hs_chapter)) {
    errors.push('hs_chapter must be 2 digits');
  }
  if (record.hs_code_6_digit && !/^\d{6}$/.test(record.hs_code_6_digit)) {
    errors.push('hs_code_6_digit must be 6 digits');
  }
  if (record.itc_hs_8_digit && !/^\d{8}$/.test(record.itc_hs_8_digit)) {
    errors.push('itc_hs_8_digit must be 8 digits');
  }

  return errors;
}

export function validateCountryInput(record) {
  const errors = [];
  if (!record.country_name) errors.push('country_name is required');
  return errors;
}
