import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

export default function ResultsPage() {
  const router = useRouter();
  const { id } = router.query;
  const { data: session, status } = useSession();
  const [conversion, setConversion] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'validation' | 'mapping'>('preview');

  useEffect(() => {
    if (!id) return;

    fetch(`/api/conversions/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setConversion(data);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError('Failed to load conversion');
        setLoading(false);
      });
  }, [id]);

  const handleDownload = async () => {
    if (!session) {
      // Redirect to login
      router.push(`/auth/signin?callbackUrl=/results/${id}`);
      return;
    }

    setDownloading(true);

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversionId: id }),
      });

      const data = await response.json();

      if (response.status === 401) {
        router.push(`/auth/signin?callbackUrl=/results/${id}`);
        return;
      }

      if (response.status === 402) {
        // Payment required
        router.push(`/pricing?conversionId=${id}`);
        return;
      }

      if (data.xml) {
        // Download the XML file
        const blob = new Blob([data.xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename || 'invoice.xml';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        setError('Download failed');
      }
    } catch (err) {
      setError('Download failed');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (error || !conversion) {
    return (
      <div style={{ padding: '2rem' }}>
        <h1>Error</h1>
        <p>{error || 'Conversion not found'}</p>
        <Link href="/">← Back to home</Link>
      </div>
    );
  }

  const validationReport = conversion.validationJson || { errors: [], warnings: [], isValid: false };
  const mappingReport = conversion.mappingJson || { fields: [], missingRequired: [] };

  return (
    <>
      <Head>
        <title>Conversie Resultaat - Peppol Converter</title>
      </Head>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <Link href="/">← Back to home</Link>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1>Conversie Resultaat</h1>
          <div>
            <button
              onClick={handleDownload}
              disabled={downloading || !conversion.success}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#0070f3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: downloading ? 'not-allowed' : 'pointer',
                fontSize: '1rem',
              }}
            >
              {downloading ? 'Downloading...' : 'Download Peppol UBL'}
            </button>
            {!session && (
              <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
                Account vereist om te downloaden
              </p>
            )}
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #ddd' }}>
            <button
              onClick={() => setActiveTab('preview')}
              style={{
                padding: '0.75rem 1rem',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                borderBottom: activeTab === 'preview' ? '2px solid #0070f3' : 'none',
              }}
            >
              XML Preview
            </button>
            <button
              onClick={() => setActiveTab('validation')}
              style={{
                padding: '0.75rem 1rem',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                borderBottom: activeTab === 'validation' ? '2px solid #0070f3' : 'none',
              }}
            >
              Validatie
              {validationReport.errors?.length > 0 && (
                <span style={{ marginLeft: '0.5rem', color: 'red' }}>
                  ({validationReport.errors.length})
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('mapping')}
              style={{
                padding: '0.75rem 1rem',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                borderBottom: activeTab === 'mapping' ? '2px solid #0070f3' : 'none',
              }}
            >
              Mapping
            </button>
          </div>
        </div>

        {activeTab === 'preview' && (
          <div style={{ backgroundColor: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {conversion.previewXml || 'No preview available'}
            </pre>
          </div>
        )}

        {activeTab === 'validation' && (
          <div>
            <div style={{ marginBottom: '1rem' }}>
              <h3>Status: {validationReport.isValid ? '✓ Geldig' : '✗ Ongeldig'}</h3>
            </div>

            {validationReport.errors?.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <h4>Fouten ({validationReport.errors.length})</h4>
                <ul>
                  {validationReport.errors.map((err: any, idx: number) => (
                    <li key={idx} style={{ marginBottom: '0.5rem' }}>
                      <strong>{err.code}:</strong> {err.message?.nl || err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {validationReport.warnings?.length > 0 && (
              <div>
                <h4>Waarschuwingen ({validationReport.warnings.length})</h4>
                <ul>
                  {validationReport.warnings.map((warn: any, idx: number) => (
                    <li key={idx} style={{ marginBottom: '0.5rem' }}>
                      <strong>{warn.code}:</strong> {warn.message?.nl || warn.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {activeTab === 'mapping' && (
          <div>
            <h3>Gevonden Velden</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #ddd' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Veld</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Waarde</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Bron</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Vertrouwen</th>
                </tr>
              </thead>
              <tbody>
                {mappingReport.fields?.map((field: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.5rem' }}>
                      <code>{field.field}</code>
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      {typeof field.value === 'object' ? JSON.stringify(field.value) : String(field.value || '-')}
                    </td>
                    <td style={{ padding: '0.5rem' }}>{field.source}</td>
                    <td style={{ padding: '0.5rem' }}>
                      {Math.round((field.confidence || 0) * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

