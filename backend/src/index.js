require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Simple table creation if not exists
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nome TEXT,
      email TEXT UNIQUE,
      senha_hash TEXT,
      criado_em TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS clientes (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id),
      nome TEXT,
      telefone TEXT,
      nascimento DATE,
      criado_em TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS agendamentos (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id),
      cliente_id INTEGER REFERENCES clientes(id),
      data DATE,
      hora TIME,
      status TEXT,
      observacoes TEXT
    );
    CREATE TABLE IF NOT EXISTS financeiro (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id),
      cliente_id INTEGER REFERENCES clientes(id),
      agendamento_id INTEGER REFERENCES agendamentos(id),
      valor NUMERIC,
      forma_pagamento TEXT,
      status TEXT,
      data_lancamento DATE,
      criado_em TIMESTAMP DEFAULT NOW()
    );
  `);
}

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: 'No token' });
  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
}

app.post('/api/register', async (req, res) => {
  const { nome, email, senha } = req.body;
  const hash = await bcrypt.hash(senha, 10);
  try {
    const { rows } = await pool.query(
      'INSERT INTO usuarios (nome, email, senha_hash) VALUES ($1, $2, $3) RETURNING id, email',
      [nome, email, hash]
    );
    const user = rows[0];
    const token = generateToken(user);
    res.json({ token });
  } catch (err) {
    res.status(400).json({ error: 'User already exists' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, senha } = req.body;
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE email=$1', [email]);
  const user = rows[0];
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });
  const match = await bcrypt.compare(senha, user.senha_hash);
  if (!match) return res.status(401).json({ message: 'Invalid credentials' });
  const token = generateToken(user);
  res.json({ token });
});

// Example protected route
app.get('/api/clients', authMiddleware, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM clientes WHERE usuario_id=$1', [req.user.id]);
  res.json(rows);
});

app.post('/api/clients', authMiddleware, async (req, res) => {
  const { nome, telefone, nascimento } = req.body;
  const { rows } = await pool.query(
    'INSERT INTO clientes (usuario_id, nome, telefone, nascimento) VALUES ($1, $2, $3, $4) RETURNING *',
    [req.user.id, nome, telefone, nascimento]
  );
  res.json(rows[0]);
});

app.get('/api/appointments', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM agendamentos WHERE usuario_id=$1',
    [req.user.id]
  );
  res.json(rows);
});

app.post('/api/appointments', authMiddleware, async (req, res) => {
  const { cliente_id, data, hora, status, observacoes } = req.body;
  const { rows } = await pool.query(
    'INSERT INTO agendamentos (usuario_id, cliente_id, data, hora, status, observacoes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [req.user.id, cliente_id, data, hora, status, observacoes]
  );
  res.json(rows[0]);
});

app.put('/api/appointments/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { data, hora, status, observacoes } = req.body;
  const { rows } = await pool.query(
    'UPDATE agendamentos SET data=$1, hora=$2, status=$3, observacoes=$4 WHERE id=$5 AND usuario_id=$6 RETURNING *',
    [data, hora, status, observacoes, id, req.user.id]
  );
  res.json(rows[0]);
});

app.delete('/api/appointments/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM agendamentos WHERE id=$1 AND usuario_id=$2', [id, req.user.id]);
  res.json({ success: true });
});

app.get('/api/finances', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM financeiro WHERE usuario_id=$1',
    [req.user.id]
  );
  res.json(rows);
});

app.post('/api/finances', authMiddleware, async (req, res) => {
  const { cliente_id, agendamento_id, valor, forma_pagamento, status, data_lancamento } = req.body;
  const { rows } = await pool.query(
    'INSERT INTO financeiro (usuario_id, cliente_id, agendamento_id, valor, forma_pagamento, status, data_lancamento) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
    [req.user.id, cliente_id, agendamento_id, valor, forma_pagamento, status, data_lancamento]
  );
  res.json(rows[0]);
});

const port = process.env.PORT || 3000;
init().then(() => {
  app.listen(port, () => console.log(`Server running on port ${port}`));
});
