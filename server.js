const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { Pool } = require('pg');
const validators = require('./validators');
const { generateLoanPDF } = require('./pdf-invoice-generator');

const app = express();
app.use(express.json());
app.use(cors());

// PostgreSQL connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'pawn_shop',
  password: '1234',
  port: 5432,
});

const cron = require('node-cron');

// This cron job will run every day at midnight (00:00)
cron.schedule('0 0 * * *', async () => {  
  try {
    const result = await pool.query(
      'SELECT * FROM loans WHERE due_date <= CURRENT_DATE AND status = $1',
      ['active']
    );

    const loansDue = result.rows;

    for (let loan of loansDue) {
      const paymentResult = await pool.query(
        'SELECT SUM(payment_amount) AS total_paid FROM payment_history WHERE loan_id = $1',
        [loan.id]
      );
      const totalPaid = paymentResult.rows[0].total_paid || 0;

      if (totalPaid >= loan.interest_amount) {
        // Extend the due date by 30 days if interest is paid
        const extendedDueDate = new Date(loan.due_date);
        extendedDueDate.setDate(extendedDueDate.getDate() + 30);  // Extend by 30 days

        await pool.query(
          'UPDATE loans SET due_date = $1 WHERE id = $2 RETURNING *',
          [extendedDueDate.toISOString().slice(0, 10), loan.id]
        );
      } else {
        // If interest is not paid, mark the loan as overdue
        await pool.query(
          'UPDATE loans SET status = $1 WHERE id = $2 RETURNING *',
          ['overdue', loan.id]
        );
      }
    }
  } catch (err) {
    console.error('Error checking due date:', err);
  }
});




// ---------------------------- REGISTER ----------------------------
app.post('/register', async (req, res) => {
  const { username, password, role } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, password, role_id) 
       VALUES ($1, $2, (SELECT id FROM user_roles WHERE role_name = $3))
       RETURNING *`,
      [username, hashedPassword, role]
    );

    res.status(201).json({ message: 'User created successfully', user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error creating user' });
  }
});

// ---------------------------- LOGIN ----------------------------
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);

    const user = result.rows[0];
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, role: user.role_id }, 'jwt_secret', { expiresIn: '1h' });

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error logging in' });
  }
});

// ---------------------------- EXTEND LOAN DUE DATE ----------------------------
app.post('/extend-loan', async (req, res) => {
  const { loanId } = req.body;

  try {
    // Fetch the loan details
    const loanResult = await pool.query('SELECT * FROM loans WHERE id = $1', [loanId]);
    const loan = loanResult.rows[0];

    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    const currentDate = new Date();
    const dueDate = new Date(loan.due_date);

    // Check if due date has passed
    if (currentDate > dueDate) {
      // Check if at least interest amount has been paid
      const paymentResult = await pool.query(
        'SELECT SUM(payment_amount) AS total_paid FROM payment_history WHERE loan_id = $1',
        [loanId]
      );
      const totalPaid = paymentResult.rows[0].total_paid || 0;

      if (totalPaid >= loan.interest_amount) {
        // Extend the due date by 30 days and add new interest
        dueDate.setDate(dueDate.getDate() + 30);

        // Update the loan with the new due date
        const updateQuery = `
          UPDATE loans
          SET due_date = $1
          WHERE id = $2
          RETURNING *;
        `;
        const updatedLoan = await pool.query(updateQuery, [dueDate, loanId]);

        res.status(200).json({
          message: 'Loan extended by 30 days!',
          loan: updatedLoan.rows[0],
        });
      } else {
        res.status(400).json({ message: 'Interest not paid, cannot extend loan.' });
      }
    } else {
      res.status(400).json({ message: 'Due date has not passed, no need to extend.' });
    }
  } catch (err) {
    console.error('Error extending loan:', err);
    res.status(500).json({ message: 'Error extending loan' });
  }
});



// ---------------------------- ADD MONEY TO LOAN ----------------------------
app.post('/add-money', async (req, res) => {
  const { loanId, amount } = req.body;

  try {
    // Get current loan details
    const loanResult = await pool.query('SELECT * FROM loans WHERE id = $1', [loanId]);
    const loan = loanResult.rows[0];

    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    // Update loan amount, recalculate interest, and total payable amount
    const newLoanAmount = parseFloat(loan.loan_amount) + parseFloat(amount);
    const newInterestAmount = (newLoanAmount * parseFloat(loan.interest_rate)) / 100;
    const newTotalPayableAmount = newLoanAmount + newInterestAmount;

    // Update loan details in the database
    const updateLoanResult = await pool.query(
      'UPDATE loans SET loan_amount = $1, interest_amount = $2, total_payable_amount = $3, remaining_balance = $4 WHERE id = $5 RETURNING *',
      [
        newLoanAmount,
        newInterestAmount,
        newTotalPayableAmount,
        newTotalPayableAmount,  // Set remaining balance to the new total payable amount
        loanId
      ]
    );

    res.status(200).json({
      message: 'Money added successfully and loan recalculated',
      loan: updateLoanResult.rows[0],
    });
  } catch (err) {
    console.error('Error adding money:', err);
    res.status(500).json({ message: 'Error adding money to the loan' });
  }
});



// ---------------------------- CHECK DUE DATE ----------------------------

app.post('/check-due-date', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM loans WHERE due_date <= CURRENT_DATE AND status = $1',
      ['active']
    );

    const loansDue = result.rows;

    for (let loan of loansDue) {
      const paymentResult = await pool.query(
        'SELECT SUM(payment_amount) AS total_paid FROM payment_history WHERE loan_id = $1',
        [loan.id]
      );
      const totalPaid = paymentResult.rows[0].total_paid || 0;

      if (totalPaid >= loan.interest_amount) {
        // If interest is paid, extend due date by 30 days
        const extendedDueDate = new Date(loan.due_date);
        extendedDueDate.setDate(extendedDueDate.getDate() + 30);

        await pool.query(
          'UPDATE loans SET due_date = $1 WHERE id = $2 RETURNING *',
          [extendedDueDate.toISOString().slice(0, 10), loan.id]
        );
      } else {
        // If interest is not paid, mark the loan as overdue
        await pool.query(
          'UPDATE loans SET status = $1 WHERE id = $2 RETURNING *',
          ['overdue', loan.id]
        );
      }
    }

    res.status(200).json({ message: 'Due date check completed successfully' });
  } catch (err) {
    console.error('Error checking due date:', err);
    res.status(500).json({ message: 'Error checking due date' });
  }
});

// ---------------------------- PAYMENT HISTORY ----------------------------

// ---------------------------- PAYMENT HISTORY ----------------------------
// ---------------------------- PAYMENT HISTORY ----------------------------
app.get('/payment-history', async (req, res) => {
  const { loanId } = req.query;  // Expect loanId as a query parameter

  try {
    // Check if loanId is provided
    if (!loanId) {
      return res.status(400).json({ message: 'Loan ID is required' });
    }

    // Query the payment history for the specified loan
    const result = await pool.query(
      'SELECT * FROM payment_history WHERE loan_id = $1 ORDER BY payment_date DESC',
      [loanId]
    );

    // If no payments found, return an empty array instead of throwing a 404 error
    if (result.rows.length === 0) {
      return res.json([]);  // Return an empty array
    }

    // Return the payment history
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching payment history:', err);
    res.status(500).json({ message: 'Error fetching payment history' });
  }
});








// ---------------------------- CREATE LOAN ----------------------------
app.post('/create-loan', async (req, res) => {
  try {
    // Map request body (handles both camelCase and snake_case)
    const mapped = validators.mapRequestToDb(req.body);

    // Extract all customer and loan fields
    const {
      first_name,
      last_name,
      email,
      home_phone,
      mobile_phone,
      birthdate,
      referral,
      identification_info,
      street_address,
      city,
      state,
      zipcode,
      customer_number,
      loan_amount: loanAmount,
      interest_rate: interestRate,
      interest_amount: inputInterestAmount,
      total_payable_amount: inputTotalPayableAmount,
      collateral_description,
      customer_note,
      loan_issued_date: loanIssuedDate,
      due_date: inputDueDate,
      loan_term: loanTerm,
      transaction_number: inputTransactionNumber,
      previous_loan_amount: previousLoanAmount,
      user_id: userId,
      created_by_user_id: createdByUserId,
      created_by_username: createdByUsername,
    } = mapped;

    // Validate required customer fields
    const nameValidation = validators.validateNames(first_name, last_name);
    if (!nameValidation.valid) {
      return res.status(400).json({ message: nameValidation.error });
    }

    // Validate loan amounts
    const amountValidation = validators.validateLoanAmounts(loanAmount, interestRate, loanTerm);
    if (!amountValidation.valid) {
      return res.status(400).json({ message: amountValidation.error });
    }

    // Validate optional customer fields
    const customerFieldsValidation = validators.validateCustomerFields({
      email,
      home_phone,
      mobile_phone,
      birthdate,
      loan_issued_date: loanIssuedDate,
      due_date: inputDueDate,
    });

    if (!customerFieldsValidation.valid) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: customerFieldsValidation.errors 
      });
    }

    // Calculate loan totals
    const totalLoanAmount = parseFloat(previousLoanAmount || 0) + parseFloat(loanAmount);
    const calculatedInterestAmount = parseFloat(inputInterestAmount) || 
      (totalLoanAmount * parseFloat(interestRate)) / 100;
    const calculatedTotalPayableAmount = parseFloat(inputTotalPayableAmount) || 
      (totalLoanAmount + calculatedInterestAmount);

    // Calculate or use provided due date
    let dueDate;
    if (inputDueDate) {
      dueDate = inputDueDate;
    } else {
      const issued = new Date(loanIssuedDate || new Date());
      const due = new Date(issued);
      due.setDate(due.getDate() + parseInt(loanTerm));
      dueDate = due.toISOString().slice(0, 10);
    }

    // Generate or use provided transaction number
    const transactionNumber = inputTransactionNumber || Math.floor(Math.random() * 1000000000).toString();

    // Insert loan with all new customer fields
    const result = await pool.query(
      `INSERT INTO loans (
        first_name, last_name, email, home_phone, mobile_phone, birthdate,
        referral, identification_info, street_address, city, state, zipcode,
        customer_number, loan_amount, interest_rate, interest_amount, total_payable_amount,
        collateral_description, customer_note, transaction_number,
        loan_issued_date, loan_term, due_date,
        status, remaining_balance, created_by, created_by_user_id, created_by_username, customer_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
      RETURNING *`,
      [
        first_name,
        last_name,
        email || null,
        home_phone || null,
        mobile_phone || null,
        birthdate || null,
        referral || null,
        identification_info || null,
        street_address || null,
        city || null,
        state || null,
        zipcode || null,
        customer_number || null,
        totalLoanAmount,
        interestRate,
        calculatedInterestAmount,
        calculatedTotalPayableAmount,
        collateral_description || null,
        customer_note || null,
        transactionNumber,
        loanIssuedDate || new Date().toISOString().slice(0, 10),
        loanTerm,
        dueDate,
        'active',
        calculatedTotalPayableAmount,
        userId || createdByUserId || null,
        createdByUserId || userId || null,
        createdByUsername || null,
        `${first_name} ${last_name}`, // Backward compatibility
      ]
    );

    const loan = validators.formatLoanResponse(result.rows[0]);

    res.status(201).json({ 
      loan,
      pdf_url: `/loan-pdf/${result.rows[0].id}`
    });
  } catch (err) {
    console.error('Error creating loan:', err);
    res.status(500).json({ message: 'Error creating loan', error: err.message });
  }
});



// ---------------------------- SEARCH LOAN ----------------------------
app.get('/search-loan', async (req, res) => {
  try {
    // Accept both camelCase and snake_case query parameters
    const firstName = req.query.firstName || req.query.first_name;
    const lastName = req.query.lastName || req.query.last_name;
    const customerNumber = req.query.customerNumber || req.query.customer_number;
    const email = req.query.email;
    const transactionNumber = req.query.transactionNumber || req.query.transaction_number;
    const mobilePhone = req.query.mobilePhone || req.query.mobile_phone;
    const homePhone = req.query.homePhone || req.query.home_phone;
    const customerName = req.query.customerName || req.query.customer_name;
    const city = req.query.city;
    const state = req.query.state;
    const zipcode = req.query.zipcode;

    // Build dynamic query
    let query = 'SELECT * FROM loans WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Search by first name
    if (firstName) {
      params.push(`%${firstName}%`);
      query += ` AND first_name ILIKE $${paramIndex}`;
      paramIndex++;
    }

    // Search by last name
    if (lastName) {
      params.push(`%${lastName}%`);
      query += ` AND last_name ILIKE $${paramIndex}`;
      paramIndex++;
    }

    // Search by customer number
    if (customerNumber) {
      params.push(`%${customerNumber}%`);
      query += ` AND customer_number ILIKE $${paramIndex}`;
      paramIndex++;
    }

    // Search by email
    if (email) {
      params.push(`%${email}%`);
      query += ` AND email ILIKE $${paramIndex}`;
      paramIndex++;
    }

    // Search by transaction number (exact match)
    if (transactionNumber) {
      params.push(transactionNumber);
      query += ` AND transaction_number = $${paramIndex}`;
      paramIndex++;
    }

    // Search by mobile phone
    if (mobilePhone) {
      params.push(`%${mobilePhone}%`);
      query += ` AND mobile_phone ILIKE $${paramIndex}`;
      paramIndex++;
    }

    // Search by home phone
    if (homePhone) {
      params.push(`%${homePhone}%`);
      query += ` AND home_phone ILIKE $${paramIndex}`;
      paramIndex++;
    }

    // Search by city
    if (city) {
      params.push(`%${city}%`);
      query += ` AND city ILIKE $${paramIndex}`;
      paramIndex++;
    }

    // Search by state
    if (state) {
      params.push(`%${state}%`);
      query += ` AND state ILIKE $${paramIndex}`;
      paramIndex++;
    }

    // Search by zipcode
    if (zipcode) {
      params.push(`%${zipcode}%`);
      query += ` AND zipcode ILIKE $${paramIndex}`;
      paramIndex++;
    }

    // Fallback: search by full customer_name (backward compatibility)
    if (customerName && !firstName && !lastName) {
      params.push(`%${customerName}%`);
      query += ` AND customer_name ILIKE $${paramIndex}`;
      paramIndex++;
    }

    // If no search criteria provided, return error
    if (params.length === 0) {
      return res.status(400).json({ message: 'At least one search criteria is required' });
    }

    // Execute query
    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No loans found' });
    }

    // Format response with snake_case fields and add PDF links
    const formattedLoans = result.rows.map(loan => ({
      ...validators.formatLoanResponse(loan),
      pdf_url: `/loan-pdf/${loan.id}`
    }));

    res.json(formattedLoans);
  } catch (err) {
    console.error('Error searching loans:', err);
    res.status(500).json({ message: 'Error searching loans', error: err.message });
  }
});


// ---------------------------- MAKE PAYMENT ----------------------------
app.post('/make-payment', async (req, res) => {
  const { loanId, paymentMethod, paymentAmount, userId } = req.body;

  try {
    // Fetch the loan details
    const loanResult = await pool.query('SELECT * FROM loans WHERE id = $1', [loanId]);
    const loan = loanResult.rows[0];

    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    // Update remaining balance after payment
    const newRemainingBalance = parseFloat(loan.remaining_balance) - parseFloat(paymentAmount);

    // Update the loan details with the new remaining balance
    const updatedLoanResult = await pool.query(
      'UPDATE loans SET remaining_balance = $1 WHERE id = $2 RETURNING *',
      [Math.max(newRemainingBalance, 0), loanId]  // Ensure it doesn't go negative
    );

    // Insert payment history
    const paymentResult = await pool.query(
      'INSERT INTO payment_history (loan_id, payment_method, payment_amount, payment_date, created_by) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4) RETURNING *',
      [loanId, paymentMethod, paymentAmount, userId || null]
    );

    // Recalculate total payable amount (loan amount + interest)
    const newTotalPayableAmount = parseFloat(loan.loan_amount) + (parseFloat(loan.loan_amount) * parseFloat(loan.interest_rate) / 100);

    // Update total payable amount in the loan record
    await pool.query(
      'UPDATE loans SET total_payable_amount = $1 WHERE id = $2',
      [newTotalPayableAmount, loanId]
    );

    // Check if the loan is fully paid
    if (newRemainingBalance === 0) {
      res.status(200).json({
        message: 'Loan fully paid off! Ready for redemption.',
        loan: updatedLoanResult.rows[0],
        paymentHistory: paymentResult.rows[0],
      });
    } else {
      // If not fully paid, return the updated loan and payment details
      res.status(200).json({
        message: 'Payment successfully processed!',
        loan: updatedLoanResult.rows[0],
        paymentHistory: paymentResult.rows[0],
      });
    }
  } catch (err) {
    console.error('Error making payment:', err);
    res.status(500).json({ message: 'Error making payment' });
  }
});






// ---------------------------- REDEEM LOAN ----------------------------


app.post('/redeem-loan', async (req, res) => {
  const { loanId, userId } = req.body;

  try {
    // Get the loan details
    const loanResult = await pool.query('SELECT * FROM loans WHERE id = $1', [loanId]);
    const loan = loanResult.rows[0];

    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    // Log loan details for debugging
    console.log('Loan found:', loan);

    // Calculate remaining balance dynamically from payments
    const paymentsResult = await pool.query(
      'SELECT SUM(payment_amount) AS total_paid FROM payment_history WHERE loan_id = $1',
      [loanId]
    );
    const totalPaid = paymentsResult.rows[0].total_paid || 0;
    const remainingBalance = loan.total_payable_amount - totalPaid;

    // Log remaining balance calculation for debugging
    console.log(`Remaining Balance: ${remainingBalance}`);

    // If the remaining balance is greater than 0, return an error
    if (remainingBalance > 0) {
      return res.status(400).json({ message: 'Loan is not fully paid, cannot redeem.' });
    }

    // Ensure the loan is not already redeemed
    if (loan.status === 'redeemed') {
      return res.status(400).json({ message: 'Loan has already been redeemed.' });
    }

    // Redeem the loan (update status to 'redeemed')
    const updatedLoan = await pool.query(
      'UPDATE loans SET status = $1 WHERE id = $2 RETURNING *',
      ['redeemed', loanId]
    );

    // Add to redeem history
    const redeemHistory = await pool.query(
      'INSERT INTO redeem_history (loan_id, redeemed_by) VALUES ($1, $2) RETURNING *',
      [loanId, userId]
    );

    res.status(200).json({
      message: 'Loan redeemed successfully!',
      loan: updatedLoan.rows[0],
      redeemHistory: redeemHistory.rows[0],
    });
  } catch (err) {
    console.error('Error redeeming loan:', err);
    res.status(500).json({ message: 'Error redeeming loan.' });
  }
});








// ---------------------------- FORFEIT LOAN ----------------------------


// Forfeit Loan route
app.post('/forfeit-loan', async (req, res) => {
  const { loanId, userId } = req.body;

  try {
    // Check if the loan exists and if it is active
    const loanQuery = 'SELECT * FROM loans WHERE id = $1';
    const loanResult = await pool.query(loanQuery, [loanId]);
    const loan = loanResult.rows[0];

    if (!loan) {
      return res.status(404).json({ message: 'Loan not found.' });
    }

    if (loan.total_payable_amount > 0) {
      return res.status(400).json({ message: 'Loan balance is not zero, cannot forfeit.' });
    }

    if (loan.status === 'redeemed' || loan.status === 'forfeited') {
      return res.status(400).json({ message: 'Loan is already redeemed or forfeited.' });
    }

    // Update loan status to 'forfeited'
    const updateQuery = 'UPDATE loans SET status = $1 WHERE id = $2 RETURNING *';
    const updatedLoan = await pool.query(updateQuery, ['forfeited', loanId]);

    // Add to forfeit history (similar to redeem history)
    const forfeitHistoryQuery = 'INSERT INTO redeem_history (loan_id, redeemed_by) VALUES ($1, $2) RETURNING *';
    const forfeitHistory = await pool.query(forfeitHistoryQuery, [loanId, userId]);

    return res.status(200).json({
      message: 'Loan forfeited successfully!',
      loan: updatedLoan.rows[0],
      forfeitHistory: forfeitHistory.rows[0],
    });
  } catch (error) {
    console.error('Error forfeiting loan:', error);
    return res.status(500).json({ message: 'Error forfeiting loan.' });
  }
});


// ======================== SHIFT MANAGEMENT & CASH BALANCING ========================

// START SHIFT - User records opening cash balance
app.post('/start-shift', async (req, res) => {
  const { userId, openingBalance } = req.body;

  try {
    if (!openingBalance || openingBalance < 0) {
      return res.status(400).json({ message: 'Invalid opening balance' });
    }

    // Check if there's an active shift for this user
    const activeShiftCheck = await pool.query(
      'SELECT * FROM shift_management WHERE user_id = $1 AND shift_end_time IS NULL',
      [userId]
    );

    if (activeShiftCheck.rows.length > 0) {
      return res.status(400).json({ message: 'User already has an active shift. Please close the previous shift first.' });
    }

    // Insert new shift record
    const result = await pool.query(
      `INSERT INTO shift_management (user_id, shift_start_time, opening_balance)
       VALUES ($1, CURRENT_TIMESTAMP, $2)
       RETURNING *`,
      [userId, parseFloat(openingBalance)]
    );

    res.status(201).json({
      message: 'Shift started successfully',
      shift: result.rows[0]
    });
  } catch (err) {
    console.error('Error starting shift:', err);
    res.status(500).json({ message: 'Error starting shift' });
  }
});


// GET CURRENT SHIFT - Get active shift for user
app.get('/current-shift', async (req, res) => {
  const { userId } = req.query;

  try {
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const result = await pool.query(
      'SELECT * FROM shift_management WHERE user_id = $1 AND shift_end_time IS NULL ORDER BY id DESC LIMIT 1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No active shift found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching current shift:', err);
    res.status(500).json({ message: 'Error fetching current shift' });
  }
});


// END SHIFT - User records closing cash balance and system verifies
app.post('/end-shift', async (req, res) => {
  const { userId, closingBalance, notes } = req.body;

  try {
    if (!closingBalance || closingBalance < 0) {
      return res.status(400).json({ message: 'Invalid closing balance' });
    }

    // Get active shift
    const shiftResult = await pool.query(
      'SELECT * FROM shift_management WHERE user_id = $1 AND shift_end_time IS NULL ORDER BY id DESC LIMIT 1',
      [userId]
    );

    if (shiftResult.rows.length === 0) {
      return res.status(404).json({ message: 'No active shift found' });
    }

    const shift = shiftResult.rows[0];

    // Get all transactions for this shift - payments received
    const paymentsResult = await pool.query(
      `SELECT COALESCE(SUM(payment_amount), 0) AS total_payments 
       FROM payment_history 
       WHERE created_by = $1 AND payment_date >= $2`,
      [userId, shift.shift_start_time]
    );

    // Get all loans given during this shift
    const loansGivenResult = await pool.query(
      `SELECT COALESCE(SUM(loan_amount), 0) AS total_loans_given 
       FROM loans 
       WHERE created_by = $1 AND loan_issued_date >= DATE($2)`,
      [userId, shift.shift_start_time]
    );

    const totalPayments = parseFloat(paymentsResult.rows[0].total_payments || 0);
    const totalLoansGiven = parseFloat(loansGivenResult.rows[0].total_loans_given || 0);
    const openingBalance = parseFloat(shift.opening_balance);

    // Calculate expected balance: opening + payments - loans
    const expectedBalance = openingBalance + totalPayments - totalLoansGiven;
    const closingBalanceNum = parseFloat(closingBalance);
    const difference = closingBalanceNum - expectedBalance;
    const isBalanced = Math.abs(difference) < 0.01; // Allow for floating point errors

    // Update shift with closing details
    const updateResult = await pool.query(
      `UPDATE shift_management 
       SET shift_end_time = CURRENT_TIMESTAMP, 
           closing_balance = $1, 
           total_payments_received = $2, 
           total_loans_given = $3, 
           expected_balance = $4, 
           difference = $5, 
           is_balanced = $6,
           notes = $7
       WHERE id = $8
       RETURNING *`,
      [closingBalanceNum, totalPayments, totalLoansGiven, expectedBalance, difference, isBalanced, notes || null, shift.id]
    );

    res.status(200).json({
      message: isBalanced ? 'Shift closed successfully and cash is balanced!' : 'Shift closed but there is a discrepancy!',
      shift: updateResult.rows[0],
      summary: {
        openingBalance: openingBalance,
        closingBalance: closingBalanceNum,
        totalPaymentsReceived: totalPayments,
        totalLoansGiven: totalLoansGiven,
        expectedBalance: expectedBalance,
        actualDifference: difference,
        isBalanced: isBalanced,
        status: isBalanced ? 'BALANCED' : 'DISCREPANCY'
      }
    });
  } catch (err) {
    console.error('Error ending shift:', err);
    res.status(500).json({ message: 'Error ending shift' });
  }
});


// GET SHIFT REPORT - Get detailed summary of a shift
app.get('/shift-report/:shiftId', async (req, res) => {
  const { shiftId } = req.params;

  try {
    // Get shift details
    const shiftResult = await pool.query(
      'SELECT * FROM shift_management WHERE id = $1',
      [shiftId]
    );

    if (shiftResult.rows.length === 0) {
      return res.status(404).json({ message: 'Shift not found' });
    }

    const shift = shiftResult.rows[0];

    // Get all payments during this shift
    const paymentsResult = await pool.query(
      `SELECT ph.*, l.customer_name, l.transaction_number
       FROM payment_history ph
       JOIN loans l ON ph.loan_id = l.id
       WHERE ph.created_by = $1 AND ph.payment_date >= $2 AND ph.payment_date <= COALESCE($3, CURRENT_TIMESTAMP)
       ORDER BY ph.payment_date DESC`,
      [shift.user_id, shift.shift_start_time, shift.shift_end_time]
    );

    // Get all loans created during this shift
    const loansResult = await pool.query(
      `SELECT id, customer_name, loan_amount, transaction_number, loan_issued_date
       FROM loans
       WHERE created_by = $1 AND loan_issued_date >= DATE($2) AND loan_issued_date <= COALESCE(DATE($3), CURRENT_DATE)
       ORDER BY loan_issued_date DESC`,
      [shift.user_id, shift.shift_start_time, shift.shift_end_time]
    );

    res.json({
      shift: shift,
      payments: paymentsResult.rows,
      loansCreated: loansResult.rows,
      summary: {
        totalTransactions: paymentsResult.rows.length + loansResult.rows.length,
        totalPaymentTransactions: paymentsResult.rows.length,
        totalLoansCreated: loansResult.rows.length
      }
    });
  } catch (err) {
    console.error('Error fetching shift report:', err);
    res.status(500).json({ message: 'Error fetching shift report' });
  }
});


// GET SHIFT HISTORY - Get all shifts for a user
app.get('/shift-history', async (req, res) => {
  const { userId } = req.query;

  try {
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const result = await pool.query(
      'SELECT * FROM shift_management WHERE user_id = $1 ORDER BY shift_start_time DESC',
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching shift history:', err);
    res.status(500).json({ message: 'Error fetching shift history' });
  }
});


// GET TODAY SHIFT SUMMARY - Quick summary for today
app.get('/today-shift-summary/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Get active shift or today's last shift
    const shiftResult = await pool.query(
      `SELECT * FROM shift_management 
       WHERE user_id = $1 AND DATE(shift_start_time) = CURRENT_DATE
       ORDER BY shift_start_time DESC LIMIT 1`,
      [userId]
    );

    if (shiftResult.rows.length === 0) {
      return res.status(404).json({ message: 'No shift found for today' });
    }

    const shift = shiftResult.rows[0];

    // Calculate current stats if shift is active
    if (!shift.shift_end_time) {
      const paymentsResult = await pool.query(
        `SELECT COALESCE(SUM(payment_amount), 0) AS total_payments,
                COUNT(*) AS payment_count
         FROM payment_history 
         WHERE created_by = $1 AND payment_date >= $2`,
        [userId, shift.shift_start_time]
      );

      const loansGivenResult = await pool.query(
        `SELECT COALESCE(SUM(loan_amount), 0) AS total_loans_given,
                COUNT(*) AS loan_count
         FROM loans 
         WHERE created_by = $1 AND loan_issued_date >= DATE($2)`,
        [userId, shift.shift_start_time]
      );

      const totalPayments = parseFloat(paymentsResult.rows[0].total_payments || 0);
      const totalLoansGiven = parseFloat(loansGivenResult.rows[0].total_loans_given || 0);
      const expectedBalance = parseFloat(shift.opening_balance) + totalPayments - totalLoansGiven;

      return res.json({
        shift: shift,
        currentStats: {
          openingBalance: shift.opening_balance,
          expectedBalance: expectedBalance,
          totalPaymentsReceived: totalPayments,
          totalLoansGiven: totalLoansGiven,
          paymentCount: paymentsResult.rows[0].payment_count,
          loanCount: loansGivenResult.rows[0].loan_count,
          shiftActive: true
        }
      });
    }

    res.json({
      shift: shift,
      shiftClosed: true
    });
  } catch (err) {
    console.error('Error fetching today shift summary:', err);
    res.status(500).json({ message: 'Error fetching shift summary' });
  }
});


// ======================== END SHIFT MANAGEMENT ========================

// ======================== PDF INVOICE GENERATION ========================

// Get Loan as PDF Invoice
app.get('/loan-pdf/:loanId', async (req, res) => {
  try {
    const { loanId } = req.params;

    // Fetch loan details
    const result = await pool.query('SELECT * FROM loans WHERE id = $1', [loanId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    const loan = result.rows[0];

    // Generate PDF
    const pdfBuffer = await generateLoanPDF(loan);

    // Send PDF with appropriate headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="loan_${loan.id}_${loan.transaction_number}.pdf"`
    );
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generating PDF:', err);
    res.status(500).json({ message: 'Error generating PDF', error: err.message });
  }
});

// Get Search Results as PDF (multiple loans on one document)
app.post('/loans-pdf', async (req, res) => {
  try {
    const { loanIds } = req.body;

    if (!loanIds || !Array.isArray(loanIds) || loanIds.length === 0) {
      return res.status(400).json({ message: 'Provide loanIds array' });
    }

    // Fetch all loans
    const placeholders = loanIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await pool.query(`SELECT * FROM loans WHERE id IN (${placeholders})`, loanIds);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No loans found' });
    }

    // Generate PDF for first loan (or create a summary if needed)
    const pdfBuffer = await generateLoanPDF(result.rows[0]);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="pawnflow_loans_${Date.now()}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generating PDFs:', err);
    res.status(500).json({ message: 'Error generating PDFs', error: err.message });
  }
});

// ======================== END PDF GENERATION ========================

// ---------------------------- START SERVER ----------------------------
app.listen(5000, () => {
  console.log('Server is running on port 5000');
});
