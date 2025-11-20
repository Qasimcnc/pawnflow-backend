# Shift Management & Cash Balancing Feature

## Overview
This feature allows users to manage their daily shifts and automatically verify cash balance based on all transactions recorded during their shift.

## Database Setup

Before using the shift management feature, run these migration scripts in order:

### 1. Create Shift Management Table
```sql
-- migrations/001_add_shift_management.sql
-- Creates the shift_management table for tracking user shifts and cash balance
```

### 2. Add User Tracking to Payment History
```sql
-- migrations/002_add_created_by_payment_history.sql
-- Adds created_by column to payment_history table
```

### 3. Add User Tracking to Loans
```sql
-- migrations/003_add_created_by_loans.sql
-- Adds created_by column to loans table
```

## API Endpoints

### 1. Start Shift
**Endpoint:** `POST /start-shift`

Start a new shift with an opening cash balance.

**Request Body:**
```json
{
  "userId": 1,
  "openingBalance": 1000
}
```

**Response:**
```json
{
  "message": "Shift started successfully",
  "shift": {
    "id": 1,
    "user_id": 1,
    "shift_start_time": "2025-11-19T10:00:00",
    "shift_end_time": null,
    "opening_balance": 1000,
    "closing_balance": null,
    "total_payments_received": 0,
    "total_loans_given": 0,
    "expected_balance": null,
    "difference": null,
    "is_balanced": false
  }
}
```

---

### 2. Get Current Active Shift
**Endpoint:** `GET /current-shift?userId=1`

Retrieve the active (ongoing) shift for a user.

**Query Parameters:**
- `userId` (required) - The ID of the user

**Response:**
```json
{
  "id": 1,
  "user_id": 1,
  "shift_start_time": "2025-11-19T10:00:00",
  "shift_end_time": null,
  "opening_balance": 1000,
  ...
}
```

---

### 3. End Shift
**Endpoint:** `POST /end-shift`

Close the active shift and verify cash balance.

**Request Body:**
```json
{
  "userId": 1,
  "closingBalance": 1100,
  "notes": "All transactions verified"
}
```

**How it calculates:**
- Gets total payments received during the shift
- Gets total loans given during the shift
- Calculates expected balance: `opening + payments - loans`
- Compares with actual closing balance entered by user
- Generates a discrepancy report if amounts don't match

**Response (Balanced):**
```json
{
  "message": "Shift closed successfully and cash is balanced!",
  "shift": {
    "id": 1,
    "user_id": 1,
    "shift_start_time": "2025-11-19T10:00:00",
    "shift_end_time": "2025-11-19T18:00:00",
    "opening_balance": 1000,
    "closing_balance": 1100,
    "total_payments_received": 500,
    "total_loans_given": 400,
    "expected_balance": 1100,
    "difference": 0,
    "is_balanced": true
  },
  "summary": {
    "openingBalance": 1000,
    "closingBalance": 1100,
    "totalPaymentsReceived": 500,
    "totalLoansGiven": 400,
    "expectedBalance": 1100,
    "actualDifference": 0,
    "isBalanced": true,
    "status": "BALANCED"
  }
}
```

**Response (Discrepancy):**
```json
{
  "message": "Shift closed but there is a discrepancy!",
  "shift": {
    ...
    "difference": -50,
    "is_balanced": false
  },
  "summary": {
    ...
    "actualDifference": -50,
    "isBalanced": false,
    "status": "DISCREPANCY"
  }
}
```

---

### 4. Get Shift Report
**Endpoint:** `GET /shift-report/:shiftId`

Get detailed breakdown of all transactions during a specific shift.

**Response:**
```json
{
  "shift": {
    "id": 1,
    "user_id": 1,
    ...
  },
  "payments": [
    {
      "id": 1,
      "loan_id": 1,
      "payment_method": "cash",
      "payment_amount": 200,
      "payment_date": "2025-11-19T11:30:00",
      "created_by": 1,
      "customer_name": "John Doe",
      "transaction_number": "806713750"
    },
    {
      "id": 2,
      "loan_id": 2,
      "payment_method": "cheque",
      "payment_amount": 300,
      "payment_date": "2025-11-19T14:20:00",
      "created_by": 1,
      "customer_name": "Jane Smith",
      "transaction_number": "806713751"
    }
  ],
  "loansCreated": [
    {
      "id": 1,
      "customer_name": "John Doe",
      "loan_amount": 100,
      "transaction_number": "806713750",
      "loan_issued_date": "2025-11-19"
    },
    {
      "id": 2,
      "customer_name": "Jane Smith",
      "loan_amount": 100,
      "transaction_number": "806713751",
      "loan_issued_date": "2025-11-19"
    }
  ],
  "summary": {
    "totalTransactions": 4,
    "totalPaymentTransactions": 2,
    "totalLoansCreated": 2
  }
}
```

---

### 5. Get Shift History
**Endpoint:** `GET /shift-history?userId=1`

Get all shifts (past and present) for a user.

**Query Parameters:**
- `userId` (required) - The ID of the user

**Response:**
```json
[
  {
    "id": 1,
    "user_id": 1,
    "shift_start_time": "2025-11-19T10:00:00",
    "shift_end_time": "2025-11-19T18:00:00",
    "opening_balance": 1000,
    "closing_balance": 1100,
    "is_balanced": true,
    ...
  },
  {
    "id": 2,
    "user_id": 1,
    "shift_start_time": "2025-11-18T10:00:00",
    "shift_end_time": "2025-11-18T18:00:00",
    "opening_balance": 1100,
    "closing_balance": 1050,
    "is_balanced": true,
    ...
  }
]
```

---

### 6. Get Today's Shift Summary
**Endpoint:** `GET /today-shift-summary/:userId`

Quick summary of today's shift (active or closed).

**Response (Active Shift):**
```json
{
  "shift": {
    "id": 1,
    "user_id": 1,
    "shift_start_time": "2025-11-19T10:00:00",
    "opening_balance": 1000,
    ...
  },
  "currentStats": {
    "openingBalance": 1000,
    "expectedBalance": 1100,
    "totalPaymentsReceived": 500,
    "totalLoansGiven": 400,
    "paymentCount": 2,
    "loanCount": 4,
    "shiftActive": true
  }
}
```

---

## Usage Example

### Daily Workflow

**Morning - Start Shift:**
```bash
POST /start-shift
{
  "userId": 1,
  "openingBalance": 1000
}
```

**Throughout the Day:**
- Create loans (include `userId` in request)
- Record payments (include `userId` in request)

**Evening - Check Today's Progress:**
```bash
GET /today-shift-summary/1
```

**Evening - Close Shift:**
```bash
POST /end-shift
{
  "userId": 1,
  "closingBalance": 1100,
  "notes": "All cash verified"
}
```

**Later - Get Detailed Report:**
```bash
GET /shift-report/1
```

---

## Formula Used for Verification

```
Expected Balance = Opening Balance + Total Payments Received - Total Loans Given

Difference = Actual Closing Balance - Expected Balance

Is Balanced = (abs(Difference) < 0.01)
```

### Example Calculation:
- Opening Balance: Rs. 1000
- Payments Received: Rs. 500
- Loans Given: Rs. 400
- Expected Balance: 1000 + 500 - 400 = **Rs. 1100**
- Actual Closing Balance: Rs. 1100
- Difference: 1100 - 1100 = **0**
- Status: ✓ **BALANCED**

---

## Important Notes

1. **User Tracking:** Both `/create-loan` and `/make-payment` endpoints now accept an optional `userId` parameter for shift tracking. Include this parameter to ensure transactions are properly attributed to the user's shift.

2. **Multiple Shifts:** A user can only have one active shift at a time. They must close the current shift before starting a new one.

3. **Floating Point Tolerance:** The system allows for a tolerance of Rs. 0.01 for floating point rounding errors.

4. **Time Zones:** All timestamps are stored in the database's timezone. Ensure your database is configured with the correct timezone.

5. **Reports:** Shift reports can be retrieved at any time, even after the shift is closed, for historical verification.

---

## Error Handling

**User already has active shift:**
```json
{
  "message": "User already has an active shift. Please close the previous shift first."
}
```

**No active shift found:**
```json
{
  "message": "No active shift found"
}
```

**Invalid closing balance:**
```json
{
  "message": "Invalid closing balance"
}
```

---

## Questions?

If you have any questions about the shift management feature, please refer to the server.js file for implementation details or contact the development team.
