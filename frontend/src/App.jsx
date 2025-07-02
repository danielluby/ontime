import React, { useEffect, useState } from 'react';

function App() {
  const [clients, setClients] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch('/api/clients', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(setClients)
      .catch(() => {});
  }, []);

  return (
    <div className="p-4">
      <h1>On-Time</h1>
      <ul>
        {clients.map(c => (
          <li key={c.id}>{c.nome} - {c.telefone}</li>
        ))}
      </ul>
    </div>
  );
}

export default App;
