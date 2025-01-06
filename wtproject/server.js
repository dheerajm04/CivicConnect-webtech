const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const multer = require('multer');
const session = require('express-session');
const path = require('path');
const app = express();

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Add session middleware
app.use(session({
  secret: 'your_secret_key', // Replace with a secure secret key
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set `true` if using HTTPS
}));

// File Upload Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Database Connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'municipal_db'
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    process.exit(1);
  }
  console.log('Connected to the database.');
});

// Routes
app.get('/', (req, res) => res.sendFile(__dirname + '/views/home.html'));
app.get('/register', (req, res) => res.sendFile(__dirname + '/views/register.html'));
app.get('/login', (req, res) => res.sendFile(__dirname + '/views/login.html'));
app.get('/citizen', (req, res) => res.sendFile(__dirname + '/views/user_report_and_track_issue.html'));
app.get('/admin', (req, res) => res.sendFile(__dirname + '/views/admin_view_issue.html'));

// Registration
app.post('/api/register', (req, res) => {
  const { email, password, role } = req.body;
  db.query('INSERT INTO users (email, password, role) VALUES (?, ?, ?)', [email, password, role], (err) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        res.json({ success: false, message: 'Email already registered!' });
      } else {
        throw err;
      }
    } else {
      res.json({ success: true, message: 'Registration successful!' });
    }
  });
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  db.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], (err, results) => {
    if (err) throw err;
    if (results.length > 0) {
      const userId = results[0].id; // Assuming `id` is the primary key in `users` table
      req.session.userId = userId; // Save userId to session
      const role = results[0].role;
      res.json({ success: true, message: 'Login successful!', role });
    } else {
      res.json({ success: false, message: 'Invalid email or password!' });
    }
  });
});

// Endpoint to handle issue reporting
app.post('/api/report-issue', upload.single('photo'), (req, res) => {
  const { category, description } = req.body;
  const photo = req.file ? req.file.filename : null;
  const userId = req.session.userId; // Retrieve the logged-in user's ID

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized access. Please log in.' });
  }

  const query = 'INSERT INTO reports (user_id, category, description, photo, status) VALUES (?, ?, ?, ?, ?)';
  db.query(query, [userId, category, description, photo, 'Pending'], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Failed to report issue.' });
    }
    res.json({ success: true, message: 'Issue reported successfully!' });
  });
});

// Endpoint to fetch user's issues
app.get('/api/my-issues', (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized access. Please log in.' });
  }

  const { category } = req.query;
  let query = 'SELECT id, category, description, status FROM reports WHERE user_id = ?';
  const params = [userId];

  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }

  db.query(query, params, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Failed to fetch issues.' });
    }
    res.json(results);
  });
});

// Endpoint to fetch issue details
app.get('/api/issue-details/:id', (req, res) => {
  const { id } = req.params;
  db.query('SELECT * FROM reports WHERE id = ?', [id], (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ message: 'Issue not found.' });
    }
    res.json(results[0]);
  });
});

// Endpoint to update issue status (Admin functionality)
app.post('/api/update-issue/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !['Pending', 'In Progress', 'Resolved'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status update.' });
  }

  const query = 'UPDATE reports SET status = ? WHERE id = ?';
  db.query(query, [status, id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Failed to update issue status.' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Issue not found.' });
    }
    res.json({ success: true, message: `Issue status updated to "${status}".` });
  });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));

app.get('/api/admin-issues', (req, res) => {
    const { category, status } = req.query;
  
    let query = 'SELECT * FROM reports WHERE 1=1';
    const params = [];
  
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
  
    db.query(query, params, (err, results) => {
      if (err) {
        console.error('Error fetching issues:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch issues.' });
      }
      res.json(results);
    });
  });
  