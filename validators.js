// validators.js - Customer field validation utilities

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean}
 */
function isValidEmail(email) {
  if (!email) return true; // Optional field
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone format (basic - allows digits, spaces, hyphens, +)
 * @param {string} phone - Phone number to validate
 * @returns {boolean}
 */
function isValidPhoneFormat(phone) {
  if (!phone) return true; // Optional field
  const phoneRegex = /^[\d\s\-\+\(\)]{7,20}$/;
  return phoneRegex.test(phone);
}

/**
 * Validate that required name fields are provided
 * @param {string} firstName - First name
 * @param {string} lastName - Last name
 * @returns {object} - { valid: boolean, error?: string }
 */
function validateNames(firstName, lastName) {
  if (!firstName || typeof firstName !== 'string' || firstName.trim() === '') {
    return { valid: false, error: 'first_name is required and must be a non-empty string' };
  }
  if (!lastName || typeof lastName !== 'string' || lastName.trim() === '') {
    return { valid: false, error: 'last_name is required and must be a non-empty string' };
  }
  return { valid: true };
}

/**
 * Validate loan numeric fields
 * @param {number} loanAmount - Loan amount
 * @param {number} interestRate - Interest rate
 * @param {number} loanTerm - Loan term in days
 * @returns {object} - { valid: boolean, error?: string }
 */
function validateLoanAmounts(loanAmount, interestRate, loanTerm) {
  if (!loanAmount || isNaN(parseFloat(loanAmount)) || parseFloat(loanAmount) <= 0) {
    return { valid: false, error: 'loan_amount must be a positive number' };
  }
  if (!interestRate || isNaN(parseFloat(interestRate)) || parseFloat(interestRate) < 0) {
    return { valid: false, error: 'interest_rate must be a non-negative number' };
  }
  if (!loanTerm || !Number.isInteger(parseInt(loanTerm)) || parseInt(loanTerm) < 0) {
    return { valid: false, error: 'loan_term must be a non-negative integer' };
  }
  return { valid: true };
}

/**
 * Convert camelCase to snake_case
 * @param {string} str - String to convert
 * @returns {string}
 */
function camelToSnake(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Convert snake_case to camelCase
 * @param {string} str - String to convert
 * @returns {string}
 */
function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

/**
 * Map request body (camelCase or snake_case) to database fields (snake_case)
 * Handles both naming conventions for all customer fields
 * @param {object} body - Request body
 * @returns {object} - Mapped fields
 */
function mapRequestToDb(body) {
  const fieldMappings = {
    'firstName': 'first_name',
    'lastName': 'last_name',
    'homePhone': 'home_phone',
    'mobilePhone': 'mobile_phone',
    'birthDate': 'birthdate',
    'birthdate': 'birthdate',
    'identificationInfo': 'identification_info',
    'loanAmount': 'loan_amount',
    'interestRate': 'interest_rate',
    'interestAmount': 'interest_amount',
    'totalPayableAmount': 'total_payable_amount',
    'loanIssuedDate': 'loan_issued_date',
    'loanTerm': 'loan_term',
    'customerNumber': 'customer_number',
    'customerName': 'customer_name',
    'collateralDescription': 'collateral_description',
    'customerNote': 'customer_note',
    'transactionNumber': 'transaction_number',
    'streetAddress': 'street_address',
    'dueDate': 'due_date',
    'userId': 'user_id',
    'createdByUserId': 'created_by_user_id',
    'createdByUsername': 'created_by_username',
  };

  const mapped = {};

  for (const [key, value] of Object.entries(body)) {
    // Check if it's a known camelCase field
    const snakeKey = fieldMappings[key] || (key.includes('_') ? key : camelToSnake(key));
    if (value !== undefined && value !== null) {
      mapped[snakeKey] = value;
    }
  }

  return mapped;
}

/**
 * Validate all extended customer fields
 * @param {object} fields - Mapped fields from database
 * @returns {object} - { valid: boolean, errors?: string[] }
 */
function validateCustomerFields(fields) {
  const errors = [];

  // Validate email if provided
  if (fields.email && !isValidEmail(fields.email)) {
    errors.push('email must be a valid email address');
  }

  // Validate phone fields if provided
  if (fields.home_phone && !isValidPhoneFormat(fields.home_phone)) {
    errors.push('home_phone must be a valid phone format (7-20 characters)');
  }

  if (fields.mobile_phone && !isValidPhoneFormat(fields.mobile_phone)) {
    errors.push('mobile_phone must be a valid phone format (7-20 characters)');
  }

  // Validate birthdate if provided (should be valid ISO date)
  if (fields.birthdate) {
    const dateObj = new Date(fields.birthdate);
    if (isNaN(dateObj.getTime())) {
      errors.push('birthdate must be a valid ISO date (YYYY-MM-DD)');
    }
  }

  // Validate dates if provided
  if (fields.loan_issued_date) {
    const dateObj = new Date(fields.loan_issued_date);
    if (isNaN(dateObj.getTime())) {
      errors.push('loan_issued_date must be a valid ISO date (YYYY-MM-DD)');
    }
  }

  if (fields.due_date) {
    const dateObj = new Date(fields.due_date);
    if (isNaN(dateObj.getTime())) {
      errors.push('due_date must be a valid ISO date (YYYY-MM-DD)');
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Convert database fields (snake_case) to response format (snake_case for API)
 * @param {object} loanObject - Loan object from database
 * @returns {object} - Formatted loan object
 */
function formatLoanResponse(loanObject) {
  const formatted = { ...loanObject };

  // Ensure all response fields are in snake_case
  const snakeCaseFields = [
    'id', 'first_name', 'last_name', 'email', 'home_phone', 'mobile_phone', 
    'birthdate', 'referral', 'identification_info', 'id_type', 'id_number',
    'street_address', 'city', 'state', 'zipcode', 'address', 'customer_name', 
    'customer_number', 'loan_amount', 'interest_rate', 'interest_amount', 
    'total_payable_amount', 'loan_issued_date', 'loan_term', 'due_date', 
    'transaction_number', 'status', 'collateral_description', 'customer_note', 
    'remaining_balance', 'created_by', 'created_by_user_id', 'created_by_username',
    'item_category', 'item_description', 'issued_date', 'redeemed_date', 
    'forfeited_date', 'is_redeemed', 'is_forfeited', 'created_at', 'updated_at'
  ];

  // Create a new object with only allowed fields
  const result = {};
  for (const key of snakeCaseFields) {
    if (key in formatted) {
      result[key] = formatted[key];
    }
  }

  return result;
}

module.exports = {
  isValidEmail,
  isValidPhoneFormat,
  validateNames,
  validateLoanAmounts,
  validateCustomerFields,
  camelToSnake,
  snakeToCamel,
  mapRequestToDb,
  formatLoanResponse,
};
