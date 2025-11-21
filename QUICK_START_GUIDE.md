# Quick Start: Extended Customer Fields

## What's New

✅ **12 new customer fields** in the loans table  
✅ **Flexible input** - accepts camelCase (from frontend) and snake_case  
✅ **Consistent output** - all responses in snake_case  
✅ **Smart validation** - email, phone, dates, amounts  
✅ **Server-side calculation** - interest amounts computed automatically  

---

## Deploy in 3 Steps

### Step 1: Run Migration
```bash
psql -U postgres -d pawn_shop -f migrations/005_add_extended_customer_fields.sql
```

### Step 2: Test Create Loan
```bash
curl -X POST http://localhost:5000/create-loan \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane@example.com",
    "mobilePhone": "555-2222",
    "birthdate": "1980-01-01",
    "streetAddress": "123 Main St",
    "city": "Boston",
    "state": "MA",
    "zipcode": "02111",
    "loanAmount": 100,
    "interestRate": 10,
    "loanTerm": 30
  }'
```

### Step 3: Test Search
```bash
curl -X GET "http://localhost:5000/search-loan?firstName=Jane&city=Boston"
```

---

## New Input Fields (camelCase)

```javascript
{
  // Customer Information (12 new fields)
  "firstName": "string",              // Required
  "lastName": "string",               // Required
  "email": "string",                  // Optional, must be valid email
  "homePhone": "string",              // Optional, 7-20 chars
  "mobilePhone": "string",            // Optional, 7-20 chars
  "birthdate": "YYYY-MM-DD",          // Optional
  "referral": "string",               // Optional
  "identificationInfo": "string",     // Optional
  "streetAddress": "string",          // Optional
  "city": "string",                   // Optional
  "state": "string",                  // Optional
  "zipcode": "string",                // Optional
  
  // Loan Information (existing + new)
  "loanAmount": 100,                  // Required, > 0
  "interestRate": 10,                 // Required, >= 0
  "loanTerm": 30,                     // Required, >= 0 days
  "loanIssuedDate": "YYYY-MM-DD",    // Optional
  "dueDate": "YYYY-MM-DD",           // Optional (auto-calculated if not provided)
  "transactionNumber": "string",      // Optional (auto-generated if not provided)
  "collateralDescription": "string",
  "customerNote": "string",
  "createdByUserId": 1,
  "createdByUsername": "admin"
}
```

---

## Response Format (snake_case)

```javascript
{
  "loan": {
    "id": 1,
    "first_name": "Jane",
    "last_name": "Doe",
    "email": "jane@example.com",
    "home_phone": "555-1111",
    "mobile_phone": "555-2222",
    "birthdate": "1980-01-01",
    "referral": "friend",
    "identification_info": "...",
    "street_address": "123 Main St",
    "city": "Boston",
    "state": "MA",
    "zipcode": "02111",
    "loan_amount": 100,
    "interest_rate": 10,
    "interest_amount": 10,              // Auto-calculated
    "total_payable_amount": 110,        // Auto-calculated
    "due_date": "2025-12-21",           // Auto-calculated
    "status": "active",
    "remaining_balance": 110,
    "transaction_number": "123456789"
  }
}
```

---

## Search Parameters

```
GET /search-loan?firstName=Jane              # Partial match
GET /search-loan?lastName=Doe                # Partial match
GET /search-loan?email=jane@example.com      # Partial match
GET /search-loan?mobilePhone=555             # Partial match
GET /search-loan?city=Boston                 # Partial match
GET /search-loan?state=MA                    # Partial match
GET /search-loan?zipcode=02111               # Partial match
GET /search-loan?customerNumber=CUST001      # Partial match
GET /search-loan?transactionNumber=123456    # Exact match

# Multiple criteria
GET /search-loan?firstName=Jane&city=Boston&state=MA
```

---

## Validation Rules

| Field | Required | Validation |
|-------|----------|-----------|
| firstName / first_name | **✓** | Non-empty string |
| lastName / last_name | **✓** | Non-empty string |
| email | | Valid email format (if provided) |
| phone fields | | 7-20 characters (if provided) |
| birthdate | | Valid ISO date YYYY-MM-DD (if provided) |
| loanAmount / loan_amount | **✓** | Must be > 0 |
| interestRate / interest_rate | **✓** | Must be >= 0 |
| loanTerm / loan_term | **✓** | Must be >= 0 integer |

---

## Error Examples

```bash
# Missing required field
curl -X POST http://localhost:5000/create-loan \
  -H "Content-Type: application/json" \
  -d '{"lastName":"Doe","loanAmount":100,"interestRate":10,"loanTerm":30}'
# Returns 400: "first_name is required and must be a non-empty string"

# Invalid email
curl -X POST http://localhost:5000/create-loan \
  -H "Content-Type: application/json" \
  -d '{
    "firstName":"Jane",
    "lastName":"Doe",
    "email":"not-an-email",
    "loanAmount":100,
    "interestRate":10,
    "loanTerm":30
  }'
# Returns 400: "email must be a valid email address"

# Search without criteria
curl -X GET "http://localhost:5000/search-loan"
# Returns 400: "At least one search criteria is required"
```

---

## Database Columns Reference

```sql
-- New customer information columns
first_name VARCHAR(128)
last_name VARCHAR(128)
email VARCHAR(255)
home_phone VARCHAR(64)
mobile_phone VARCHAR(64)
birthdate DATE
referral VARCHAR(128)
identification_info TEXT
street_address TEXT
city VARCHAR(128)
state VARCHAR(64)
zipcode VARCHAR(32)

-- Existing loan columns (still present)
customer_name VARCHAR(255)          -- Auto-populated: "FirstName LastName"
customer_number VARCHAR(50)
loan_amount DECIMAL(10, 2)
interest_rate DECIMAL(5, 2)
interest_amount DECIMAL(10, 2)
total_payable_amount DECIMAL(10, 2)
remaining_balance DECIMAL(10, 2)
collateral_description TEXT
customer_note TEXT
transaction_number VARCHAR(50)
loan_issued_date DATE
loan_term INTEGER
due_date DATE
status VARCHAR(20)
created_by INTEGER
created_by_user_id INTEGER
created_by_username VARCHAR(100)
created_at TIMESTAMP
updated_at TIMESTAMP
```

---

## Performance Indexes

```sql
CREATE INDEX idx_loans_first_name ON loans(first_name);
CREATE INDEX idx_loans_last_name ON loans(last_name);
CREATE INDEX idx_loans_email ON loans(email);
CREATE INDEX idx_loans_mobile_phone ON loans(mobile_phone);
```

Automatically created when running migration 005.

---

## Backward Compatibility

✅ Old loans still accessible  
✅ Legacy `customer_name` field populated automatically  
✅ Old search methods still work  
✅ Existing endpoints unchanged  

---

## Integration Tests

Run tests to verify everything works:

```bash
# Terminal 1: Start server
node server.js

# Terminal 2: Run tests
node tests/integration.test.js
```

**Test Coverage:**
- 9 create-loan tests (happy path + validation)
- 9 search-loan tests (multiple criteria + errors)
- Total: 18 integration tests

---

## Files Modified

1. **migrations/005_add_extended_customer_fields.sql** - New migration with 12 columns
2. **validators.js** - Enhanced with `validateCustomerFields()` and 25+ field mappings
3. **server.js** - Updated `/create-loan` and `/search-loan` endpoints
4. **tests/integration.test.js** - New test file with 18 tests
5. **API_DOCUMENTATION.md** - Updated with new examples
6. **README.md** - Updated installation guide

---

## Git Info

**Latest Commit:** `24228f9`  
**Repository:** mateeque39/PawnFlow-Backend  
**Branch:** master  

---

## Need Help?

- See `EXTENDED_CUSTOMER_FIELDS_SUMMARY.md` for complete technical documentation
- See `API_DOCUMENTATION.md` for full API reference
- See `README.md` for setup instructions
- Check `migrations/005_add_extended_customer_fields.sql` for database schema

---

**Status: ✅ Ready for Production**
