import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { dispatch, fetchAuditEvents, fetchPipelineHealth, pushAuditEvent } from './lib/cloud';
import AuthScreen from './components/AuthScreen';

export default function App() {
  const { ready, cloudEnabled, userId, email: accountEmail, isGuest, signOut, exitGuest } = useAuth();

  const [activeTab, setActiveTab] = useState('single');
  const [actionType, setActionType] = useState('transfer');
  
  // Single Request Form States
  const [employeeId, setEmployeeId] = useState('EMP-101');
  const [email, setEmail] = useState('employee@company.example');
  const [prevTeam, setPrevTeam] = useState('TEAM-A');
  const [newTeam, setNewTeam] = useState('TEAM-B');
  const [reason, setReason] = useState('Role realignment and department restructuring');
  
  // Drag & Drop CSV States
  const [dragActive, setDragActive] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  
  // Request Execution States
  const [loading, setLoading] = useState(false);
  const [pipeline, setPipeline] = useState('unknown');
  const [auditLogs, setAuditLogs] = useState(() => [
    { id: 'LOG-994', time: new Date().toLocaleTimeString(), type: 'SYSTEM', msg: 'AegisZero Security Core initialized.' }
  ]);

  const fileInputRef = useRef(null);

  // Whether the server holds a webhook URL is only knowable from the service itself.
  useEffect(() => {
    let cancelled = false;
    fetchPipelineHealth().then((health) => {
      if (!cancelled) setPipeline(health.pipeline ?? 'unreachable');
    });
    return () => { cancelled = true; };
  }, []);

  const isPipelineConfigured = pipeline === 'configured';

  // Persisted audit trail: a signed-in operator sees the same stream on any device.
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    fetchAuditEvents(userId).then((rows) => {
      if (!cancelled && rows.length) setAuditLogs(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // CSV Reader Logic
  const handleFileUpload = (file) => {
    if (!file || !file.name.endsWith('.csv')) {
      alert('Invalid file format. Please upload a standard .csv spreadsheet.');
      return;
    }
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length <= 1) return;
      const headers = lines[0].split(',').map(h => h.trim());
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim());
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        return obj;
      });
      setParsedRows(rows);
      addAuditLog('CSV_PARSED', `Loaded ${rows.length} record(s) from ${file.name}`);
    };
    reader.readAsText(file);
  };

  const addAuditLog = (type, msg, payload) => {
    const entry = {
      id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      time: new Date().toLocaleTimeString(),
      type,
      msg
    };
    setAuditLogs(prev => [entry, ...prev]);
    if (userId) pushAuditEvent(userId, { ...entry, payload });
  };

  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Webhook Dispatcher
  const handleSubmit = async () => {
    if (!userId) {
      addAuditLog('ERROR', 'Dispatch requires a signed-in operator. Anonymous requests are refused by the service.');
      return;
    }

    setLoading(true);

    let kind;
    let payload;
    if (activeTab === 'single') {
      kind = 'single';
      payload = {
        event_type: actionType === 'transfer' ? 'employee.team_transferred' : 'employee.access_revoked',
        employee_id: employeeId,
        company_email: email,
        previous_team_id: prevTeam,
        new_team_id: actionType === 'transfer' ? newTeam : 'REVOKED',
        justification: reason,
        effective_at: new Date().toISOString()
      };
      addAuditLog('DISPATCH', `Sending ${actionType.toUpperCase()} signal for ${email}...`);
    } else {
      kind = 'batch';
      payload = {
        event_type: 'bulk.batch_processed',
        records: parsedRows,
        effective_at: new Date().toISOString()
      };
      addAuditLog('DISPATCH', `Broadcasting batch payload (${parsedRows.length} items) to Workato pipeline...`);
    }

    try {
      const result = await dispatch(kind, payload);
      addAuditLog('SUCCESS', `Workato Orchestrator accepted transaction (ref ${result.request_id}).`, payload);
    } catch (err) {
      // The service already turns upstream failures into one generic sentence plus a
      // request id, so whatever arrives here is safe to show the operator.
      addAuditLog('ERROR', err.message, payload);
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#090d16', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8125rem', fontFamily: 'monospace' }}>
        Loading console…
      </div>
    );
  }

  if (cloudEnabled && !userId && !isGuest) {
    return <AuthScreen />;
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#090d16',
      color: '#f1f5f9',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Top Enterprise Navigation Header */}
      <header style={{
        padding: '1rem 2rem',
        backgroundColor: '#0f172a',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '36px', height: '36px', backgroundColor: '#3b82f6', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.125rem' }}>
            🛡️
          </div>
          <div>
            <div style={{ fontSize: '1.125rem', fontWeight: '700', letterSpacing: '-0.025em', color: '#ffffff' }}>AegisZero Enterprise</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Zero-Trust Governance & Automated IAM Remediation</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', fontSize: '0.8125rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span
            title={isPipelineConfigured ? 'The dispatch service holds a webhook endpoint for this deployment.' : 'Set WORKATO_WEBHOOK_URL on the dispatch service to enable it.'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: isPipelineConfigured ? '#10b981' : '#fbbf24',
              backgroundColor: isPipelineConfigured ? 'rgba(16, 185, 129, 0.1)' : 'rgba(251, 191, 36, 0.1)',
              padding: '0.25rem 0.75rem',
              borderRadius: '9999px',
              border: `1px solid ${isPipelineConfigured ? 'rgba(16, 185, 129, 0.2)' : 'rgba(251, 191, 36, 0.25)'}`
            }}
          >
            <span style={{ width: '8px', height: '8px', backgroundColor: isPipelineConfigured ? '#10b981' : '#fbbf24', borderRadius: '50%' }}></span>
            {isPipelineConfigured ? 'Webhook configured' : 'Webhook not configured'}
          </span>

          {cloudEnabled && userId && (
            <>
              <span style={{ color: '#94a3b8', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {accountEmail}
              </span>
              <button
                type="button"
                onClick={() => signOut()}
                style={{ padding: '0.3125rem 0.75rem', backgroundColor: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
              >
                Sign out
              </button>
            </>
          )}

          {cloudEnabled && !userId && isGuest && (
            <button
              type="button"
              onClick={exitGuest}
              title="Switch to a signed-in account so the audit trail is saved"
              style={{ padding: '0.3125rem 0.75rem', backgroundColor: '#1e293b', color: '#fbbf24', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
            >
              Guest session — sign in
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="aegis-main" style={{ flex: 1, maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
        
        {/* Left Console Workspace */}
        <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)' }}>
          
          {/* Navigation Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', marginBottom: '1.5rem', gap: '1rem' }}>
            <button
              onClick={() => setActiveTab('single')}
              style={{
                padding: '0.75rem 1rem', border: 'none', background: 'none', color: activeTab === 'single' ? '#3b82f6' : '#94a3b8',
                borderBottom: activeTab === 'single' ? '2px solid #3b82f6' : '2px solid transparent',
                fontWeight: '600', cursor: 'pointer', fontSize: '0.875rem'
              }}>
              Single Identity Execution
            </button>
            <button
              onClick={() => setActiveTab('csv')}
              style={{
                padding: '0.75rem 1rem', border: 'none', background: 'none', color: activeTab === 'csv' ? '#3b82f6' : '#94a3b8',
                borderBottom: activeTab === 'csv' ? '2px solid #3b82f6' : '2px solid transparent',
                fontWeight: '600', cursor: 'pointer', fontSize: '0.875rem'
              }}>
              Bulk CSV Ingestion
            </button>
          </div>

          {/* SINGLE TAB */}
          {activeTab === 'single' && (
            <div>
              {/* Action Mode Toggle */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.5rem' }}>Execution Mode</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div 
                    onClick={() => setActionType('transfer')}
                    style={{
                      padding: '1rem', borderRadius: '8px', border: `1px solid ${actionType === 'transfer' ? '#3b82f6' : '#334155'}`,
                      backgroundColor: actionType === 'transfer' ? 'rgba(59, 130, 246, 0.08)' : '#1e293b', cursor: 'pointer'
                    }}>
                    <div style={{ fontWeight: '600', color: actionType === 'transfer' ? '#60a5fa' : '#f8fafc', marginBottom: '0.25rem' }}>🔄 Team Transfer</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Reassign entitlement profiles and sync RBAC in real-time.</div>
                  </div>

                  <div 
                    onClick={() => setActionType('revoke')}
                    style={{
                      padding: '1rem', borderRadius: '8px', border: `1px solid ${actionType === 'revoke' ? '#ef4444' : '#334155'}`,
                      backgroundColor: actionType === 'revoke' ? 'rgba(239, 68, 68, 0.08)' : '#1e293b', cursor: 'pointer'
                    }}>
                    <div style={{ fontWeight: '600', color: actionType === 'revoke' ? '#f87171' : '#f8fafc', marginBottom: '0.25rem' }}>🚫 Revoke All Entitlements</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Deprovision all active OAuth tokens and team permissions.</div>
                  </div>
                </div>
              </div>

              {/* Form Controls */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>Employee Identifier</label>
                  <input type="text" value={employeeId} onChange={e => setEmployeeId(e.target.value)} style={{ width: '100%', padding: '0.625rem', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#fff', fontSize: '0.875rem' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>Corporate Email Target</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '0.625rem', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#fff', fontSize: '0.875rem' }} />
                </div>
              </div>

              {actionType === 'transfer' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>Origin Department ID</label>
                    <input type="text" value={prevTeam} onChange={e => setPrevTeam(e.target.value)} style={{ width: '100%', padding: '0.625rem', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#fff', fontSize: '0.875rem' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>Target Entitlement Group</label>
                    <select value={newTeam} onChange={e => setNewTeam(e.target.value)} style={{ width: '100%', padding: '0.625rem', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#fff', fontSize: '0.875rem' }}>
                      <option value="TEAM-B">Engineering & Core Infra (TEAM-B)</option>
                      <option value="TEAM-C">Security Operations & Governance (TEAM-C)</option>
                      <option value="TEAM-D">Cloud Architecture & DevOps (TEAM-D)</option>
                    </select>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>Audit / Governance Justification</label>
                <input type="text" value={reason} onChange={e => setReason(e.target.value)} style={{ width: '100%', padding: '0.625rem', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#fff', fontSize: '0.875rem' }} />
              </div>
            </div>
          )}

          {/* BULK CSV TAB */}
          {activeTab === 'csv' && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div 
                onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragActive ? '#3b82f6' : '#334155'}`, padding: '2.5rem', textAlign: 'center', borderRadius: '8px',
                  backgroundColor: dragActive ? 'rgba(59, 130, 246, 0.05)' : '#1e293b', cursor: 'pointer', transition: 'all 0.2s'
                }}>
                <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])} />
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📂</div>
                <div style={{ fontWeight: '600', color: '#f8fafc', marginBottom: '0.25rem' }}>
                  {csvFile ? csvFile.name : "Drag & Drop Bulk CSV File Here"}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Supports headers: employee_id, company_email, new_team_id</div>
              </div>

              {parsedRows.length > 0 && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#1e293b', borderRadius: '6px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    ✔ Parsed {parsedRows.length} Employee Record(s) Ready for Dispatch
                  </div>
                  <div style={{ maxHeight: '120px', overflowY: 'auto', fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                    {parsedRows.slice(0, 3).map((r, i) => (
                      <div key={i}>{JSON.stringify(r)}</div>
                    ))}
                    {parsedRows.length > 3 && <div>... and {parsedRows.length - 3} more.</div>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Submit CTA */}
          <button
            onClick={handleSubmit}
            disabled={loading || (activeTab === 'csv' && parsedRows.length === 0)}
            style={{
              width: '100%', padding: '0.875rem',
              backgroundColor: actionType === 'revoke' && activeTab === 'single' ? '#dc2626' : '#2563eb',
              color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '0.875rem',
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'background-color 0.2s'
            }}>
            {loading ? "Transmitting Signal..." : activeTab === 'single' ? (actionType === 'transfer' ? "Execute Team Transfer" : "Revoke All Entitlements") : `Dispatch ${parsedRows.length} Batch Records`}
          </button>
        </div>

        {/* Right Audit & Live Event Stream Sidebar */}
        <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#f8fafc' }}>Live Audit Console</span>
            <span style={{ fontSize: '0.6875rem', color: userId ? '#10b981' : '#64748b', fontFamily: 'monospace' }}>
              {userId ? 'SAVED TO CLOUD' : 'SESSION ONLY'}
            </span>
          </div>

          <div style={{ flex: 1, backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.75rem', overflowY: 'auto', maxHeight: '420px' }}>
            {auditLogs.map((log) => (
              <div key={log.id} style={{ marginBottom: '0.75rem', borderBottom: '1px dashed #1e293b', paddingBottom: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', marginBottom: '0.125rem' }}>
                  <span>[{log.time}]</span>
                  <span style={{ color: log.type === 'SUCCESS' ? '#10b981' : log.type === 'ERROR' ? '#f87171' : '#60a5fa' }}>{log.type}</span>
                </div>
                <div style={{ color: '#cbd5e1', wordBreak: 'break-word' }}>{log.msg}</div>
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  );
}