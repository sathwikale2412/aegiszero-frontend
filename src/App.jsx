import React, { useState } from 'react';

export default function App() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  const WORKATO_WEBHOOK_URL = "https://webhooks.workato.com/webhooks/rest/1ee88f26-d27f-40cd-89af-9364d2aac512/employee_transfer";

  const handleTransferSubmit = async () => {
    setLoading(true);
    setStatus(null);

    const payload = {
      event_id: `TR-2026-${Math.floor(10000 + Math.random() * 90000)}`,
      event_type: "employee.team_transferred",
      employee_id: "EMP-101",
      company_email: "employee@company.example",
      previous_team_id: "TEAM-A",
      new_team_id: "TEAM-B",
      effective_at: new Date().toISOString(),
      source: "hr_demo",
      correlation_id: `CORR-${Math.floor(10000 + Math.random() * 90000)}`
    };

    try {
      const response = await fetch(WORKATO_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.status === "ok") {
        setStatus("SUCCESS");
      }
    } catch (error) {
      console.error("Workato Intake Error:", error);
      setStatus("ERROR");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f172a',
      color: '#ffffff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'sans-serif'
    }}>
      <div style={{
        padding: '2rem',
        backgroundColor: '#1e293b',
        borderRadius: '1rem',
        border: '1px solid #334155',
        textAlign: 'center',
        maxWidth: '400px',
        width: '100%'
      }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>AegisZero Portal</h1>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Workato Backend Pipeline Integration
        </p>

        <button
          onClick={handleTransferSubmit}
          disabled={loading}
          style={{
            width: '100%',
            padding: '0.75rem',
            backgroundColor: '#6366f1',
            color: '#ffffff',
            border: 'none',
            borderRadius: '0.5rem',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? "Triggering Workato..." : "Submit Employee Transfer"}
        </button>

        {status === "SUCCESS" && (
          <p style={{ color: '#34d399', marginTop: '1rem', fontSize: '0.875rem' }}>
            ✅ Event sent to Workato! Check Slack channel.
          </p>
        )}

        {status === "ERROR" && (
          <p style={{ color: '#f43f5e', marginTop: '1rem', fontSize: '0.875rem' }}>
            ❌ Failed to reach Workato webhook.
          </p>
        )}
      </div>
    </div>
  );
}