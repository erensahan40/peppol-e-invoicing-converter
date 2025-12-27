import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ConversionResult, ValidationError } from '@/types/invoice';

export default function Home() {
  const router = useRouter();
  const { data: session } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'ubl' | 'validation' | 'mapping' | 'edit'>('preview');
  const [dragActive, setDragActive] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [updating, setUpdating] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle scroll for sticky header
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Smooth scroll to section
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const headerOffset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
    setMobileMenuOpen(false);
  };

  const handleFileChange = (selectedFile: File) => {
    setFile(selectedFile);
    setResult(null);
    setError(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileChange(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf' || 
          droppedFile.name.endsWith('.xlsx') || 
          droppedFile.name.endsWith('.xls')) {
        handleFileChange(droppedFile);
      } else {
        setError('Alleen PDF en Excel bestanden zijn toegestaan');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.message 
          ? `${errorData.error || 'Fout bij conversie'}: ${errorData.message}`
          : (errorData.error || 'Fout bij conversie');
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setResult(data);
      if (data.normalizedInvoice) {
        setEditingInvoice(JSON.parse(JSON.stringify(data.normalizedInvoice))); // Deep copy for editing
      }
      setIsApproved(false); // Reset approval when new file is uploaded
      
      // Scroll to results
      setTimeout(() => {
        document.getElementById('converter')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err: any) {
      setError(err.message || 'Er is een fout opgetreden');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateInvoice = async (autoDownload: boolean = false) => {
    if (!editingInvoice || !result) return;

    setUpdating(true);
    setError(null);

    try {
      const response = await fetch('/api/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ normalizedInvoice: editingInvoice }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Fout bij bijwerken');
      }

      const data = await response.json();
      setResult(data);
      setEditingInvoice(JSON.parse(JSON.stringify(data.normalizedInvoice)));
      
      // Mark as approved if auto-download was requested
      if (autoDownload) {
        setIsApproved(true);
        setTimeout(() => {
          downloadXML();
        }, 500);
      }
    } catch (err: any) {
      setError(err.message || 'Er is een fout opgetreden bij bijwerken');
    } finally {
      setUpdating(false);
    }
  };

  const downloadXML = async () => {
    if (!result || !result.conversionId) {
      // Fallback for old result format
      if (result?.ublXml) {
        const blob = new Blob([result.ublXml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice-${result.normalizedInvoice?.invoiceNumber || 'unknown'}.xml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      return;
    }

    // New flow: requires auth and payment
    if (!session) {
      router.push(`/auth/signin?callbackUrl=/results/${result.conversionId}`);
      return;
    }

    setDownloading(true);

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversionId: result.conversionId }),
      });

      const data = await response.json();

      if (response.status === 401) {
        router.push(`/auth/signin?callbackUrl=/results/${result.conversionId}`);
        return;
      }

      if (response.status === 402) {
        // Payment required
        router.push(`/pricing?conversionId=${result.conversionId}`);
        return;
      }

      if (data.xml) {
        const blob = new Blob([data.xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename || 'invoice.xml';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError('Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <>
      <Head>
        <title>Peppol E-invoicing Converter - Converteer Facturen naar UBL XML | Gratis Tool</title>
        <meta name="description" content="Converteer PDF en Excel facturen automatisch naar Peppol-compatibele UBL XML. Gratis tool met AI-powered analyse, validatie en export. Start direct met je eerste conversie!" />
        <meta name="keywords" content="peppol, e-invoicing, ubl xml, factuur converter, pdf naar xml, excel naar xml, peppol converter, belgië, nederland, elektronische facturering" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="author" content="Peppol E-invoicing Converter" />
        <meta name="robots" content="index, follow" />
        <meta name="language" content="Dutch" />
        <link rel="icon" href="/favicon.ico" />
        
        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Peppol E-invoicing Converter - Converteer Facturen naar UBL XML" />
        <meta property="og:description" content="Converteer PDF en Excel facturen automatisch naar Peppol-compatibele UBL XML. Gratis tool met AI-powered analyse en validatie." />
        <meta property="og:site_name" content="Peppol E-invoicing Converter" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Peppol E-invoicing Converter - Converteer Facturen naar UBL XML" />
        <meta name="twitter:description" content="Converteer PDF en Excel facturen automatisch naar Peppol-compatibele UBL XML. Gratis tool met AI-powered analyse." />
        
        {/* Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "Peppol E-invoicing Converter",
              "description": "Converteer PDF en Excel facturen automatisch naar Peppol-compatibele UBL XML",
              "url": process.env.NEXT_PUBLIC_SITE_URL || "https://peppol-converter.com",
              "applicationCategory": "BusinessApplication",
              "operatingSystem": "Web",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "EUR"
              },
              "featureList": [
                "PDF factuur conversie",
                "Excel factuur conversie",
                "AI-powered data extractie",
                "Peppol validatie",
                "UBL XML export",
                "Automatische foutdetectie"
              ]
            })
          }}
        />
      </Head>

      <div className="app-container">
        {/* Navigation Header */}
        <header className={`landing-header ${scrolled ? 'scrolled' : ''}`}>
          <nav className="nav-container">
            <div className="nav-logo" onClick={() => scrollToSection('hero')}>
              <span className="nav-logo-icon">📄</span>
              <span className="nav-logo-text">Peppol Converter</span>
            </div>
            
            {/* Desktop Navigation */}
            <ul className="nav-menu">
              <li>
                <a 
                  href="#features" 
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection('features');
                  }}
                  className="nav-link"
                >
                  Features
                </a>
              </li>
              <li>
                <a 
                  href="#how-it-works" 
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection('how-it-works');
                  }}
                  className="nav-link"
                >
                  Hoe het werkt
                </a>
              </li>
              <li>
                <a 
                  href="#faq" 
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection('faq');
                  }}
                  className="nav-link"
                >
                  FAQ
                </a>
              </li>
              <li>
                <a 
                  href="#converter" 
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection('converter');
                  }}
                  className="nav-link nav-link-cta"
                >
                  Converter
                </a>
              </li>
            </ul>

            {/* Mobile Menu Button */}
            <button 
              className={`mobile-menu-toggle ${mobileMenuOpen ? 'active' : ''}`}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              <span></span>
              <span></span>
              <span></span>
            </button>

            {/* CTA Button */}
            <div className="nav-cta">
              <a 
                href="#converter" 
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection('converter');
                }}
                className="nav-cta-button"
              >
                Start Nu
              </a>
            </div>
          </nav>

          {/* Mobile Menu */}
          <div className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`}>
            <ul className="mobile-menu-list">
              <li>
                <a 
                  href="#features" 
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection('features');
                  }}
                  className="mobile-nav-link"
                >
                  Features
                </a>
              </li>
              <li>
                <a 
                  href="#how-it-works" 
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection('how-it-works');
                  }}
                  className="mobile-nav-link"
                >
                  Hoe het werkt
                </a>
              </li>
              <li>
                <a 
                  href="#faq" 
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection('faq');
                  }}
                  className="mobile-nav-link"
                >
                  FAQ
                </a>
              </li>
              <li>
                <a 
                  href="#converter" 
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection('converter');
                  }}
                  className="mobile-nav-link mobile-nav-cta"
                >
                  Start Converter
                </a>
              </li>
            </ul>
          </div>
        </header>

        <main className="landing-main">
          {/* Hero Section */}
          <section id="hero" className="hero-section">
            <div className="hero-container">
              <div className="hero-content">
                <h1 className="hero-title">
                  Converteer je Facturen naar <span className="highlight">Peppol UBL XML</span> in Seconden
                </h1>
                <p className="hero-description">
                  Upload een PDF of Excel factuur en krijg automatisch een Peppol-compatibele UBL XML. 
                  Met AI-powered analyse, automatische validatie en duidelijke foutmeldingen.
                </p>
                <div className="hero-features">
                  <div className="hero-feature-item">
                    <span className="feature-icon">✓</span>
                    <span>3 Gratis Conversies</span>
                  </div>
                  <div className="hero-feature-item">
                    <span className="feature-icon">✓</span>
                    <span>Geen Account Nodig</span>
                  </div>
                  <div className="hero-feature-item">
                    <span className="feature-icon">✓</span>
                    <span>AI-Powered</span>
                  </div>
                  <div className="hero-feature-item">
                    <span className="feature-icon">✓</span>
                    <span>Pay on Success</span>
                  </div>
                </div>
                <div className="hero-cta">
                  <a href="#converter" className="cta-button-primary">
                    Probeer Gratis — Geen Account Nodig
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </a>
                  <Link href="/pricing" className="cta-button-secondary">
                    <span>Bekijk Prijzen</span>
                  </Link>
                </div>
              </div>
              <div className="hero-visual">
                <div className="hero-card">
                  <div className="hero-card-header">
                    <div className="hero-card-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                  <div className="hero-card-content">
                    <div className="hero-card-icon">📄</div>
                    <div className="hero-card-text">PDF / Excel</div>
                    <div className="hero-card-arrow">→</div>
                    <div className="hero-card-icon">✓</div>
                    <div className="hero-card-text">UBL XML</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Converter Section */}
          <section id="converter" className="converter-section">
            <div className="section-container">
              <div className="section-header">
                <h2 className="section-title">Start je Conversie</h2>
                <p className="section-subtitle">
                  Upload je factuur en krijg binnen seconden je Peppol UBL XML
                </p>
              </div>
              <div className="upload-card">
            <form onSubmit={handleSubmit} className="upload-form">
              <div
                className={`drop-zone ${dragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  id="file-input"
                  accept=".pdf,.xlsx,.xls"
                  onChange={handleInputChange}
                  className="file-input-hidden"
                  disabled={loading}
                />
                
                {loading ? (
                  <div className="drop-zone-content">
                    <div className="spinner"></div>
                    <h3>Factuur wordt verwerkt...</h3>
                    <p>Even geduld, dit kan even duren</p>
                  </div>
                ) : file ? (
                  <div className="drop-zone-content">
                    <div className="file-icon">✓</div>
                    <h3>{file.name}</h3>
                    <p>{formatFileSize(file.size)}</p>
                    <button
                      type="button"
                      className="change-file-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = '';
                        }
                      }}
                    >
                      Bestand wijzigen
                    </button>
                  </div>
                ) : (
                  <div className="drop-zone-content">
                    <div className="upload-icon">
                      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                      </svg>
                    </div>
                    <h3>Sleep je factuur hier naartoe</h3>
                    <p>of klik om een bestand te selecteren</p>
                    <div className="supported-formats">
                      <span className="format-badge">PDF</span>
                      <span className="format-badge">Excel</span>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={!file || loading}
                className="convert-button"
              >
                {loading ? (
                  <>
                    <span className="button-spinner"></span>
                    Converteren...
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Converteren naar UBL XML
                  </>
                )}
              </button>
            </form>

            {error && (
              <div className="error-alert">
                <div className="alert-icon">⚠️</div>
                <div className="alert-content">
                  <strong>Fout opgetreden</strong>
                  <p className="error-message">{error}</p>
                </div>
              </div>
            )}
          </div>

          {result && (
            <div className="results-card">
              {!isApproved ? (
                <>
                  {/* Step 1: Preview - No editing */}
                  <div className="step-indicator">
                    <div className="step active">
                      <div className="step-number">1</div>
                      <div className="step-label">Bekijk factuur</div>
                    </div>
                    <div className="step-divider"></div>
                    <div className="step active">
                      <div className="step-number">2</div>
                      <div className="step-label">Download UBL XML</div>
                    </div>
                  </div>

                  <div className="preview-only-container">
                    {editingInvoice && result.originalFile ? (
                      <StyledInvoicePreview
                        originalFile={result.originalFile}
                        invoice={editingInvoice}
                        validationReport={result.validationReport}
                        mappingReport={result.mappingReport}
                        onUpdate={setEditingInvoice}
                        onApprove={() => {
                          if (result) {
                            downloadXML();
                          }
                        }}
                        isUpdating={updating}
                      />
                    ) : editingInvoice ? (
                      <InvoicePreview
                        invoice={editingInvoice}
                        validationReport={result.validationReport}
                        onUpdate={setEditingInvoice}
                        onApprove={() => {
                          if (result) {
                            downloadXML();
                          }
                        }}
                        isUpdating={updating}
                      />
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  {/* Step 2: After Approval - Show all options */}
                  <div className="step-indicator">
                    <div className="step completed">
                      <div className="step-number">✓</div>
                      <div className="step-label">Bekijk en bewerk factuur</div>
                    </div>
                    <div className="step-divider completed"></div>
                    <div className="step completed">
                      <div className="step-number">✓</div>
                      <div className="step-label">Goedkeuren</div>
                    </div>
                    <div className="step-divider completed"></div>
                    <div className="step active">
                      <div className="step-number">3</div>
                      <div className="step-label">Download UBL XML</div>
                    </div>
                  </div>

                  <div className="results-header">
                    <h2>Conversieresultaat</h2>
                    <div className={`validation-status ${result.validationReport.isValid ? 'valid' : 'invalid'}`}>
                      {result.validationReport.isValid ? (
                        <>
                          <span className="status-icon">✓</span>
                          <span>Geldig</span>
                        </>
                      ) : (
                        <>
                          <span className="status-icon">✗</span>
                          <span>Ongeldig</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="tabs-container">
                    <div className="tabs">
                      <button
                        className={`tab-button ${activeTab === 'preview' ? 'active' : ''}`}
                        onClick={() => setActiveTab('preview')}
                      >
                        <span>📄 Factuur Preview</span>
                      </button>
                      <button
                        className={`tab-button ${activeTab === 'ubl' ? 'active' : ''}`}
                        onClick={() => setActiveTab('ubl')}
                      >
                        <span>UBL XML</span>
                      </button>
                      <button
                        className={`tab-button ${activeTab === 'validation' ? 'active' : ''}`}
                        onClick={() => setActiveTab('validation')}
                      >
                        <span>Validatie</span>
                        {result.validationReport.errors.length > 0 && (
                          <span className="tab-badge error">{result.validationReport.errors.length}</span>
                        )}
                        {result.validationReport.warnings.length > 0 && (
                          <span className="tab-badge warning">{result.validationReport.warnings.length}</span>
                        )}
                      </button>
                      <button
                        className={`tab-button ${activeTab === 'mapping' ? 'active' : ''}`}
                        onClick={() => setActiveTab('mapping')}
                      >
                        <span>Mapping</span>
                      </button>
                    </div>

                    <div className="tab-panel">
                  {activeTab === 'preview' && result && editingInvoice && (
                    <InvoicePreview
                      invoice={editingInvoice}
                      validationReport={result.validationReport}
                      onUpdate={setEditingInvoice}
                      onApprove={() => handleUpdateInvoice(true)}
                      isUpdating={updating}
                      readOnly={true}
                    />
                  )}

                  {activeTab === 'ubl' && (
                    <div className="ubl-panel">
                      <div className="panel-actions">
                        <button 
                          onClick={downloadXML} 
                          className="action-button primary"
                          disabled={downloading}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                          </svg>
                          {downloading ? 'Downloading...' : 'Download Peppol UBL'}
                        </button>
                        {result.conversionId && (
                          <Link href={`/results/${result.conversionId}`} className="action-button secondary">
                            View Full Results
                          </Link>
                        )}
                        <button
                          onClick={() => copyToClipboard(result.xmlPreview || result.ublXml || '')}
                          className="action-button secondary"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                          Kopieer Preview
                        </button>
                      </div>
                      {result.quota && (
                        <div style={{ padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: '4px', marginBottom: '1rem' }}>
                          <strong>Gratis conversies over:</strong> {result.quota.freeLeft} / 3
                          {result.quota.isLimited && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
                              Account vereist om te downloaden. <Link href="/pricing">Bekijk prijzen</Link>
                            </div>
                          )}
                        </div>
                      )}
                      {!session && result.needsLoginToDownload && (
                        <div style={{ padding: '1rem', backgroundColor: '#fff3cd', borderRadius: '4px', marginBottom: '1rem' }}>
                          <strong>Account vereist om te downloaden.</strong>
                          <div style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                            Geen account nodig om te proberen.
                          </div>
                        </div>
                      )}
                      <div className="xml-viewer">
                        <pre className="xml-code">{result.xmlPreview || result.ublXml || ''}</pre>
                        {result.xmlPreview && result.xmlPreview.includes('truncated') && (
                          <div style={{ padding: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
                            Dit is een preview. Download volledige XML na login.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'validation' && (
                    <div className="validation-panel">
                      <div className="validation-summary">
                        <div className="summary-stats">
                          <div className="stat-item">
                            <div className="stat-value error">{result.validationReport.errors.length}</div>
                            <div className="stat-label">Fouten</div>
                          </div>
                          <div className="stat-item">
                            <div className="stat-value warning">{result.validationReport.warnings.length}</div>
                            <div className="stat-label">Waarschuwingen</div>
                          </div>
                        </div>
                      </div>

                      {result.validationReport.errors.length > 0 && (
                        <div className="validation-section">
                          <h3 className="section-title error">
                            <span className="section-icon">✗</span>
                            Fouten
                          </h3>
                          <div className="validation-list">
                            {result.validationReport.errors.map((err: any, idx: number) => (
                              <ValidationItem key={idx} error={err} />
                            ))}
                          </div>
                        </div>
                      )}

                      {result.validationReport.warnings.length > 0 && (
                        <div className="validation-section">
                          <h3 className="section-title warning">
                            <span className="section-icon">⚠</span>
                            Waarschuwingen
                          </h3>
                          <div className="validation-list">
                            {result.validationReport.warnings.map((err: any, idx: number) => (
                              <ValidationItem key={idx} error={err} />
                            ))}
                          </div>
                        </div>
                      )}

                      {result.validationReport.errors.length === 0 &&
                        result.validationReport.warnings.length === 0 && (
                          <div className="success-state">
                            <div className="success-icon">✓</div>
                            <h3>Geen validatiefouten gevonden!</h3>
                            <p>De factuur voldoet aan alle Peppol-vereisten.</p>
                          </div>
                        )}
                    </div>
                  )}

                  {activeTab === 'mapping' && (
                    <div className="mapping-panel">
                      <h3 className="section-title">Gevonden velden</h3>
                      <div className="mapping-table-wrapper">
                        <table className="mapping-table">
                          <thead>
                            <tr>
                              <th>Veld</th>
                              <th>Waarde</th>
                              <th>Bron</th>
                              <th>Vertrouwen</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.mappingReport.fields.map((field: any, idx: number) => (
                              <tr key={idx}>
                                <td className="field-name">
                                  <code>{field.field}</code>
                                </td>
                                <td className="field-value">
                                  {typeof field.value === 'object'
                                    ? JSON.stringify(field.value)
                                    : String(field.value || '-')}
                                </td>
                                <td className="field-source">{field.source}</td>
                                <td className="field-confidence">
                                  <div className="confidence-indicator">
                                    <div
                                      className="confidence-bar"
                                      style={{ width: `${field.confidence * 100}%` }}
                                    />
                                    <span className="confidence-text">
                                      {Math.round(field.confidence * 100)}%
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {result.mappingReport.missingRequired.length > 0 && (
                        <div className="missing-fields-alert">
                          <div className="alert-header">
                            <span className="alert-icon">⚠️</span>
                            <h3>Ontbrekende verplichte velden</h3>
                          </div>
                          <ul className="missing-list">
                            {result.mappingReport.missingRequired.map((field: string, idx: number) => (
                              <li key={idx}>
                                <code>{field}</code>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                    </div>
                  </div>
                </>
              )}
            </div>
          )}
            </div>
          </section>

          {/* Features Section */}
          <section id="features" className="features-section">
            <div className="section-container">
              <div className="section-header">
                <h2 className="section-title">Waarom Onze Converter?</h2>
                <p className="section-subtitle">
                  Alles wat je nodig hebt om je facturen Peppol-ready te maken
                </p>
              </div>
              <div className="features-grid">
                <div className="feature-card">
                  <div className="feature-icon-large">🤖</div>
                  <h3 className="feature-title">AI-Powered Extractie</h3>
                  <p className="feature-description">
                    Gebruik Google Gemini AI voor intelligente data extractie uit complexe facturen. 
                    Herkent automatisch alle belangrijke velden, zelfs bij gescande documenten.
                  </p>
                </div>
                <div className="feature-card">
                  <div className="feature-icon-large">✓</div>
                  <h3 className="feature-title">Automatische Validatie</h3>
                  <p className="feature-description">
                    Volledige Peppol BIS Billing 3.0 validatie met duidelijke foutmeldingen in 
                    Nederlands en Engels. Controleert alle verplichte velden en business rules.
                  </p>
                </div>
                <div className="feature-card">
                  <div className="feature-icon-large">📊</div>
                  <h3 className="feature-title">Mapping Rapport</h3>
                  <p className="feature-description">
                    Zie precies welke velden gevonden zijn, waar ze vandaan komen en hoe betrouwbaar 
                    de extractie is. Perfect voor kwaliteitscontrole.
                  </p>
                </div>
                <div className="feature-card">
                  <div className="feature-icon-large">⚡</div>
                  <h3 className="feature-title">Snel & Efficiënt</h3>
                  <p className="feature-description">
                    Conversie in seconden, geen wachttijden. Ondersteunt zowel PDF als Excel bestanden. 
                    Direct download van je UBL XML bestand.
                  </p>
                </div>
                <div className="feature-card">
                  <div className="feature-icon-large">🔒</div>
                  <h3 className="feature-title">Privacy First</h3>
                  <p className="feature-description">
                    Je facturen worden alleen verwerkt voor conversie. Geen opslag, geen tracking, 
                    volledige privacy. Alles gebeurt lokaal op de server.
                  </p>
                </div>
                <div className="feature-card">
                  <div className="feature-icon-large">🌍</div>
                  <h3 className="feature-title">Peppol Compatibel</h3>
                  <p className="feature-description">
                    Volledig compatibel met Peppol BIS Billing 3.0 standaard. Werkt voor België, 
                    Nederland en andere Europese landen die Peppol gebruiken.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* How It Works Section */}
          <section id="how-it-works" className="how-it-works-section">
            <div className="section-container">
              <div className="section-header">
                <h2 className="section-title">Hoe Werkt Het?</h2>
                <p className="section-subtitle">
                  Drie eenvoudige stappen naar je Peppol UBL XML
                </p>
              </div>
              <div className="steps-container">
                <div className="step-item">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h3 className="step-title">Upload je Factuur</h3>
                    <p className="step-description">
                      Sleep je PDF of Excel factuur naar de upload zone, of klik om een bestand te selecteren. 
                      Ondersteunt alle standaard factuurformaten.
                    </p>
                  </div>
                </div>
                <div className="step-item">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h3 className="step-title">Automatische Verwerking</h3>
                    <p className="step-description">
                      Onze AI analyseert je factuur, extraheert alle data en valideert deze tegen 
                      Peppol standaarden. Ontbrekende velden worden automatisch aangevuld.
                    </p>
                  </div>
                </div>
                <div className="step-item">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h3 className="step-title">Download UBL XML</h3>
                    <p className="step-description">
                      Bekijk je geconverteerde factuur, controleer validatieresultaten en download 
                      direct je Peppol-compatibele UBL XML bestand.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* FAQ Section */}
          <section id="faq" className="faq-section">
            <div className="section-container">
              <div className="section-header">
                <h2 className="section-title">Veelgestelde Vragen</h2>
              </div>
              <div className="faq-grid">
                <div className="faq-item">
                  <h3 className="faq-question">Is deze tool echt gratis?</h3>
                  <p className="faq-answer">
                    Ja, volledig gratis! Geen verborgen kosten, geen registratie vereist. 
                    Je kunt direct aan de slag met het converteren van je facturen.
                  </p>
                </div>
                <div className="faq-item">
                  <h3 className="faq-question">Welke bestandsformaten worden ondersteund?</h3>
                  <p className="faq-answer">
                    We ondersteunen PDF en Excel (XLSX, XLS) facturen. Zowel text-based PDFs 
                    als gescande documenten (via AI) worden ondersteund.
                  </p>
                </div>
                <div className="faq-item">
                  <h3 className="faq-question">Worden mijn facturen opgeslagen?</h3>
                  <p className="faq-answer">
                    Nee, je facturen worden alleen verwerkt voor conversie en niet opgeslagen. 
                    Alles gebeurt lokaal op de server en wordt direct verwijderd na verwerking.
                  </p>
                </div>
                <div className="faq-item">
                  <h3 className="faq-question">Werkt dit voor alle landen?</h3>
                  <p className="faq-answer">
                    De tool is geoptimaliseerd voor België en Nederland, maar werkt ook voor 
                    andere Europese landen die Peppol gebruiken. Valuta en BTW-regels worden 
                    automatisch herkend.
                  </p>
                </div>
                <div className="faq-item">
                  <h3 className="faq-question">Wat als er fouten worden gevonden?</h3>
                  <p className="faq-answer">
                    Je krijgt een duidelijk validatierapport met alle fouten en waarschuwingen 
                    in Nederlands en Engels. Je kunt de factuur bewerken en opnieuw valideren 
                    voordat je exporteert.
                  </p>
                </div>
                <div className="faq-item">
                  <h3 className="faq-question">Is de UBL XML Peppol-compatibel?</h3>
                  <p className="faq-answer">
                    Ja, alle gegenereerde UBL XML bestanden voldoen aan Peppol BIS Billing 3.0 
                    standaard en kunnen direct gebruikt worden met Peppol Access Points.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="landing-footer">
            <div className="footer-container">
              <div className="footer-top">
                <div className="footer-brand">
                  <div className="footer-logo">
                    <span className="footer-logo-icon">📄</span>
                    <span className="footer-logo-text">Peppol Converter</span>
                  </div>
                  <p className="footer-description">
                    De eenvoudigste en snelste manier om je facturen naar Peppol-compatibele UBL XML te converteren. 
                    100% gratis, geen registratie vereist.
                  </p>
                  <div className="footer-social">
                    <a 
                      href="https://github.com" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="social-link"
                      aria-label="GitHub"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                      </svg>
                    </a>
                    <a 
                      href="https://twitter.com" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="social-link"
                      aria-label="Twitter"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                      </svg>
                    </a>
                    <a 
                      href="https://linkedin.com" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="social-link"
                      aria-label="LinkedIn"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                      </svg>
                    </a>
                  </div>
                </div>

                <div className="footer-content">
                  <div className="footer-section">
                    <h4 className="footer-title">Product</h4>
                    <ul className="footer-links">
                      <li>
                        <a 
                          href="#features" 
                          onClick={(e) => {
                            e.preventDefault();
                            scrollToSection('features');
                          }}
                        >
                          <span>Features</span>
                        </a>
                      </li>
                      <li>
                        <a 
                          href="#how-it-works" 
                          onClick={(e) => {
                            e.preventDefault();
                            scrollToSection('how-it-works');
                          }}
                        >
                          <span>Hoe het werkt</span>
                        </a>
                      </li>
                      <li>
                        <a 
                          href="#converter" 
                          onClick={(e) => {
                            e.preventDefault();
                            scrollToSection('converter');
                          }}
                        >
                          <span>Start Converter</span>
                        </a>
                      </li>
                      <li>
                        <a 
                          href="#faq" 
                          onClick={(e) => {
                            e.preventDefault();
                            scrollToSection('faq');
                          }}
                        >
                          <span>Veelgestelde Vragen</span>
                        </a>
                      </li>
                    </ul>
                  </div>

                  <div className="footer-section">
                    <h4 className="footer-title">Ondersteuning</h4>
                    <ul className="footer-links">
                      <li>
                        <a href="https://peppol.eu" target="_blank" rel="noopener noreferrer">
                          <span>Peppol Informatie</span>
                        </a>
                      </li>
                      <li>
                        <a href="https://docs.peppol.eu" target="_blank" rel="noopener noreferrer">
                          <span>Documentatie</span>
                        </a>
                      </li>
                      <li>
                        <a href="https://peppol.eu/peppol-network/" target="_blank" rel="noopener noreferrer">
                          <span>Over Peppol</span>
                        </a>
                      </li>
                      <li>
                        <a href="mailto:support@peppol-converter.com">
                          <span>Contact</span>
                        </a>
                      </li>
                    </ul>
                  </div>

                  <div className="footer-section">
                    <h4 className="footer-title">Bedrijf</h4>
                    <ul className="footer-links">
                      <li>
                        <a href="#about"><span>Over Ons</span></a>
                      </li>
                      <li>
                        <a href="#blog"><span>Blog</span></a>
                      </li>
                      <li>
                        <a href="#careers"><span>Carrières</span></a>
                      </li>
                      <li>
                        <a href="#partners"><span>Partners</span></a>
                      </li>
                    </ul>
                  </div>

                  <div className="footer-section">
                    <h4 className="footer-title">Legal</h4>
                    <ul className="footer-links">
                      <li>
                        <a href="#privacy"><span>Privacybeleid</span></a>
                      </li>
                      <li>
                        <a href="#terms"><span>Algemene Voorwaarden</span></a>
                      </li>
                      <li>
                        <a href="#cookies"><span>Cookiebeleid</span></a>
                      </li>
                      <li>
                        <a href="#license"><span>Licentie</span></a>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="footer-bottom">
                <div className="footer-bottom-content">
                  <p className="footer-copyright">
                    © {new Date().getFullYear()} Peppol E-invoicing Converter. Alle rechten voorbehouden.
                  </p>
                  <div className="footer-legal-links">
                    <a href="#privacy">Privacy</a>
                    <span className="footer-separator">•</span>
                    <a href="#terms">Voorwaarden</a>
                    <span className="footer-separator">•</span>
                    <a href="#cookies">Cookies</a>
                  </div>
                </div>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </>
  );
}

function InvoicePreview({ 
  invoice, 
  validationReport, 
  onUpdate, 
  onApprove, 
  isUpdating,
  readOnly = false
}: { 
  invoice: any; 
  validationReport: any; 
  onUpdate: (invoice: any) => void; 
  onApprove: () => void;
  isUpdating: boolean;
  readOnly?: boolean;
}) {
  const getFieldError = (fieldPath: string) => {
    return [...validationReport.errors, ...validationReport.warnings].find(
      (err: any) => err.fieldPath === fieldPath
    );
  };

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('nl-NL', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const formatCurrency = (amount: number | undefined) => {
    if (amount === undefined || amount === null) return '€ 0,00';
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: invoice.currency || 'EUR',
    }).format(amount);
  };

  const calculateLineTotal = (line: any) => {
    const qty = line.quantity || 0;
    const price = line.unitPrice || 0;
    return qty * price;
  };

  const calculateVatAmount = (line: any) => {
    const total = line.lineTotal || calculateLineTotal(line);
    const vatRate = line.vatRate || 0;
    return (total * vatRate) / 100;
  };

  const subtotal = invoice.lines?.reduce((sum: number, line: any) => sum + (line.lineTotal || calculateLineTotal(line)), 0) || 0;
  const vatTotal = invoice.lines?.reduce((sum: number, line: any) => sum + calculateVatAmount(line), 0) || 0;
  const total = invoice.totalInclVat || (subtotal + vatTotal);

  return (
    <div className="invoice-preview-container">
      <div className="invoice-preview">
        {/* Header */}
        <div className="invoice-header">
          <div className="invoice-header-left">
            <h1 className="invoice-title">FACTUUR</h1>
            <div className="invoice-meta">
              <div className={`invoice-field ${getFieldError('Invoice.ID') ? 'has-error' : ''}`}>
                <label>Factuurnummer:</label>
                <input
                  type="text"
                  value={invoice.invoiceNumber || ''}
                  onChange={(e) => onUpdate({ ...invoice, invoiceNumber: e.target.value })}
                  placeholder="Factuurnummer"
                  className="editable-field"
                  disabled={readOnly}
                />
                {getFieldError('Invoice.ID') && (
                  <span className="field-error-hint">⚠ {getFieldError('Invoice.ID')?.message.nl}</span>
                )}
              </div>
              <div className={`invoice-field ${getFieldError('Invoice.IssueDate') ? 'has-error' : ''}`}>
                <label>Factuurdatum:</label>
                <input
                  type="date"
                  value={invoice.issueDate ? new Date(invoice.issueDate).toISOString().split('T')[0] : ''}
                  onChange={(e) => onUpdate({ ...invoice, issueDate: e.target.value ? new Date(e.target.value) : undefined })}
                  className="editable-field"
                  disabled={readOnly}
                />
                {getFieldError('Invoice.IssueDate') && (
                  <span className="field-error-hint">⚠ {getFieldError('Invoice.IssueDate')?.message.nl}</span>
                )}
              </div>
              {invoice.dueDate && (
                <div className="invoice-field">
                  <label>Vervaldatum:</label>
                  <input
                    type="date"
                    value={invoice.dueDate ? new Date(invoice.dueDate).toISOString().split('T')[0] : ''}
                    onChange={(e) => onUpdate({ ...invoice, dueDate: e.target.value ? new Date(e.target.value) : undefined })}
                    className="editable-field"
                    disabled={readOnly}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="invoice-header-right">
            <div className="invoice-logo">📄</div>
          </div>
        </div>

        {/* Parties */}
        <div className="invoice-parties">
          <div className="invoice-party supplier">
            <h3>Leverancier</h3>
            <div className={`invoice-field ${getFieldError('Invoice.AccountingSupplierParty.Party.PartyName.Name') ? 'has-error' : ''}`}>
              <input
                type="text"
                value={invoice.supplier?.name || ''}
                onChange={(e) => onUpdate({
                  ...invoice,
                  supplier: { ...invoice.supplier, name: e.target.value }
                })}
                placeholder="Leveranciersnaam *"
                className="editable-field party-name"
              />
              {getFieldError('Invoice.AccountingSupplierParty.Party.PartyName.Name') && (
                <span className="field-error-hint">⚠ {getFieldError('Invoice.AccountingSupplierParty.Party.PartyName.Name')?.message.nl}</span>
              )}
            </div>
            <div className="party-address">
              <input
                type="text"
                value={invoice.supplier?.address?.street || ''}
                onChange={(e) => onUpdate({
                  ...invoice,
                  supplier: {
                    ...invoice.supplier,
                    address: { ...invoice.supplier?.address, street: e.target.value }
                  }
                })}
                placeholder="Straat en nummer"
                className="editable-field"
                style={{ marginBottom: '0.5rem' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  value={invoice.supplier?.address?.postalCode || ''}
                  onChange={(e) => onUpdate({
                    ...invoice,
                    supplier: {
                      ...invoice.supplier,
                      address: { ...invoice.supplier?.address, postalCode: e.target.value }
                    }
                  })}
                  placeholder="Postcode"
                  className="editable-field"
                  disabled={readOnly}
                  style={{ width: '100px' }}
                />
                <input
                  type="text"
                  value={invoice.supplier?.address?.city || ''}
                  onChange={(e) => onUpdate({
                    ...invoice,
                    supplier: {
                      ...invoice.supplier,
                      address: { ...invoice.supplier?.address, city: e.target.value }
                    }
                  })}
                  placeholder="Stad"
                  className="editable-field"
                  disabled={readOnly}
                  style={{ flex: 1 }}
                />
              </div>
              <div className={`invoice-field ${getFieldError('Invoice.AccountingSupplierParty.Party.PostalAddress.Country.IdentificationCode') ? 'has-error' : ''}`}>
                <input
                  type="text"
                  value={invoice.supplier?.address?.countryCode || 'BE'}
                  onChange={(e) => onUpdate({
                    ...invoice,
                    supplier: {
                      ...invoice.supplier,
                      address: { ...invoice.supplier?.address, countryCode: e.target.value }
                    }
                  })}
                  placeholder="Landcode *"
                  className="editable-field country-code"
                  maxLength={2}
                />
                {getFieldError('Invoice.AccountingSupplierParty.Party.PostalAddress.Country.IdentificationCode') && (
                  <span className="field-error-hint">⚠ {getFieldError('Invoice.AccountingSupplierParty.Party.PostalAddress.Country.IdentificationCode')?.message.nl}</span>
                )}
              </div>
            </div>
            <div className="invoice-field" style={{ marginTop: '0.5rem' }}>
              <input
                type="text"
                value={invoice.supplier?.vatNumber || ''}
                onChange={(e) => onUpdate({
                  ...invoice,
                  supplier: { ...invoice.supplier, vatNumber: e.target.value }
                })}
                placeholder="BTW-nummer"
                className="editable-field"
              />
            </div>
          </div>

          <div className="invoice-party customer">
            <h3>Klant</h3>
            <div className={`invoice-field ${getFieldError('Invoice.AccountingCustomerParty.Party.PartyName.Name') ? 'has-error' : ''}`}>
              <input
                type="text"
                value={invoice.customer?.name || ''}
                onChange={(e) => onUpdate({
                  ...invoice,
                  customer: { ...invoice.customer, name: e.target.value }
                })}
                placeholder="Klantnaam *"
                className="editable-field party-name"
              />
              {getFieldError('Invoice.AccountingCustomerParty.Party.PartyName.Name') && (
                <span className="field-error-hint">⚠ {getFieldError('Invoice.AccountingCustomerParty.Party.PartyName.Name')?.message.nl}</span>
              )}
            </div>
            <div className="party-address">
              <input
                type="text"
                value={invoice.customer?.address?.street || ''}
                onChange={(e) => onUpdate({
                  ...invoice,
                  customer: {
                    ...invoice.customer,
                    address: { ...invoice.customer?.address, street: e.target.value }
                  }
                })}
                placeholder="Straat en nummer"
                className="editable-field"
                style={{ marginBottom: '0.5rem' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  value={invoice.customer?.address?.postalCode || ''}
                  onChange={(e) => onUpdate({
                    ...invoice,
                    customer: {
                      ...invoice.customer,
                      address: { ...invoice.customer?.address, postalCode: e.target.value }
                    }
                  })}
                  placeholder="Postcode"
                  className="editable-field"
                  disabled={readOnly}
                  style={{ width: '100px' }}
                />
                <input
                  type="text"
                  value={invoice.customer?.address?.city || ''}
                  onChange={(e) => onUpdate({
                    ...invoice,
                    customer: {
                      ...invoice.customer,
                      address: { ...invoice.customer?.address, city: e.target.value }
                    }
                  })}
                  placeholder="Stad"
                  className="editable-field"
                  disabled={readOnly}
                  style={{ flex: 1 }}
                />
              </div>
            </div>
            <div className="invoice-field" style={{ marginTop: '0.5rem' }}>
              <input
                type="text"
                value={invoice.customer?.vatNumber || ''}
                onChange={(e) => onUpdate({
                  ...invoice,
                  customer: { ...invoice.customer, vatNumber: e.target.value }
                })}
                placeholder="BTW-nummer"
                className="editable-field"
              />
            </div>
          </div>
        </div>

        {/* Invoice Lines */}
        <div className="invoice-lines-section">
          <h3>Factuurregels</h3>
          {invoice.lines && invoice.lines.length > 0 ? (
            <>
              <table className="invoice-lines-table">
                <thead>
                  <tr>
                    <th>Omschrijving</th>
                    <th>Aantal</th>
                    <th>Prijs</th>
                    <th>BTW %</th>
                    <th>Totaal</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line: any, idx: number) => (
                    <tr key={idx}>
                      <td>
                        <input
                          type="text"
                          value={line.description || ''}
                          onChange={(e) => {
                            const newLines = [...invoice.lines];
                            newLines[idx] = { ...line, description: e.target.value };
                            onUpdate({ ...invoice, lines: newLines });
                          }}
                          placeholder="Product omschrijving"
                          className="editable-field"
                          disabled={readOnly}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          value={line.quantity || ''}
                          onChange={(e) => {
                            const newLines = [...invoice.lines];
                            const qty = parseFloat(e.target.value) || 0;
                            newLines[idx] = { ...line, quantity: qty, lineTotal: qty * (line.unitPrice || 0) };
                            onUpdate({ ...invoice, lines: newLines });
                          }}
                          className="editable-field number-input"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          value={line.unitPrice || ''}
                          onChange={(e) => {
                            const newLines = [...invoice.lines];
                            const price = parseFloat(e.target.value) || 0;
                            newLines[idx] = { ...line, unitPrice: price, lineTotal: (line.quantity || 0) * price };
                            onUpdate({ ...invoice, lines: newLines });
                          }}
                          className="editable-field number-input"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          value={line.vatRate || ''}
                          onChange={(e) => {
                            const newLines = [...invoice.lines];
                            newLines[idx] = { ...line, vatRate: parseFloat(e.target.value) || 0 };
                            onUpdate({ ...invoice, lines: newLines });
                          }}
                          className="editable-field number-input"
                        />
                      </td>
                      <td className="line-total">{formatCurrency(line.lineTotal || calculateLineTotal(line))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div className="no-lines-message">
              <p>Geen factuurregels gevonden</p>
              <button
                type="button"
                onClick={() => {
                  onUpdate({
                    ...invoice,
                    lines: [...(invoice.lines || []), {
                      description: '',
                      quantity: 1,
                      unitPrice: 0,
                      vatRate: 21,
                      lineTotal: 0
                    }]
                  });
                }}
                className="add-line-button"
              >
                + Regel toevoegen
              </button>
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="invoice-totals">
          <div className="totals-row">
            <span>Subtotaal (excl. BTW):</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="totals-row">
            <span>BTW:</span>
            <span>{formatCurrency(vatTotal)}</span>
          </div>
          <div className="totals-row total">
            <span>Totaal (incl. BTW):</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Approval Section - Only show if not read-only */}
        {!readOnly && (
          <div className="invoice-approval">
            <div className="approval-status">
              {validationReport.warnings.length > 0 && (
                <div className="approval-warnings">
                  <strong>⚠ {validationReport.warnings.length} waarschuwing(en):</strong>
                  <ul>
                    {validationReport.warnings.slice(0, 3).map((warn: any, idx: number) => (
                      <li key={idx}>{warn.message.nl}</li>
                    ))}
                    {validationReport.warnings.length > 3 && (
                      <li>... en {validationReport.warnings.length - 3} meer</li>
                    )}
                  </ul>
                </div>
              )}
              {validationReport.errors.length > 0 && (
                <div className="approval-errors">
                  <strong>✗ {validationReport.errors.length} fout(en) gevonden</strong>
                </div>
              )}
              {validationReport.errors.length === 0 && validationReport.warnings.length === 0 && (
                <div className="approval-success">
                  ✓ Factuur is compleet en klaar voor export
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onApprove}
              disabled={isUpdating}
              className="approve-button"
            >
              {isUpdating ? (
                <>⏳ UBL XML genereren...</>
              ) : (
                <>✓ Goedkeuren en UBL XML downloaden</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StyledInvoicePreview({
  originalFile,
  invoice,
  validationReport,
  mappingReport,
  onUpdate,
  onApprove,
  isUpdating,
}: {
  originalFile: { data: string; mimeType: string; filename: string };
  invoice: any;
  validationReport: any;
  mappingReport?: any;
  onUpdate: (invoice: any) => void;
  onApprove: () => void;
  isUpdating: boolean;
}) {
  const fileUrl = `data:${originalFile.mimeType};base64,${originalFile.data}`;
  const isPDF = originalFile.mimeType === 'application/pdf';

  return (
    <div className="styled-invoice-preview">
      <div className="styled-file-container">
        {/* Original File Display - No editing, just view */}
        {isPDF ? (
          <iframe
            src={fileUrl}
            className="styled-pdf-viewer"
            title="Originele factuur"
          />
        ) : (
          <div className="styled-excel-viewer">
            <p>Excel bestand: {originalFile.filename}</p>
            <a
              href={fileUrl}
              download={originalFile.filename}
              className="download-original-button"
            >
              📥 Download origineel Excel bestand
            </a>
          </div>
        )}

        {/* Status and Download Section */}
        <div className="invoice-status-section">
          <div className="status-info">
            {/* Data Quality Score */}
            {mappingReport?.dataQuality && (
              <div className={`data-quality-badge data-quality-${mappingReport.dataQuality.level}`}>
                <span className="quality-icon">
                  {mappingReport.dataQuality.level === 'excellent' ? '✓' : 
                   mappingReport.dataQuality.level === 'good' ? '✓' :
                   mappingReport.dataQuality.level === 'fair' ? '⚠' : '✗'}
                </span>
                <div className="quality-info">
                  <strong>Data Kwaliteit: {mappingReport.dataQuality.level.toUpperCase()}</strong>
                  <span className="quality-score">
                    {Math.round(mappingReport.dataQuality.score * 100)}% betrouwbaarheid
                  </span>
                  {mappingReport.dataQuality.issues.length > 0 && (
                    <div className="quality-issues">
                      {mappingReport.dataQuality.issues.slice(0, 3).map((issue: string, idx: number) => (
                        <span key={idx} className="quality-issue-tag">{issue}</span>
                      ))}
                      {mappingReport.dataQuality.issues.length > 3 && (
                        <span className="quality-issue-tag">+{mappingReport.dataQuality.issues.length - 3} meer</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {(validationReport.warnings.length > 0 || validationReport.errors.length > 0) ? (
              <div className="status-warning">
                <span className="status-icon">⚠</span>
                <div>
                  <strong>Opmerking:</strong> De factuur is automatisch geconverteerd naar Peppol-formaat.
                  {validationReport.errors.length > 0 && (
                    <span className="error-count"> {validationReport.errors.length} kritieke fout(en) gevonden.</span>
                  )}
                  {validationReport.warnings.length > 0 && (
                    <span> {validationReport.warnings.length} waarschuwing(en) gevonden.</span>
                  )}
                  {validationReport.errors.length > 0 && (
                    <div className="critical-warning">
                      ⚠️ <strong>Let op:</strong> Er zijn kritieke fouten gevonden. Controleer de validatie tab voor details voordat u de UBL XML gebruikt.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="status-success">
                <span className="status-icon">✓</span>
                <div>
                  <strong>Succesvol geconverteerd!</strong> De factuur is automatisch Peppol-vriendelijk gemaakt.
                </div>
              </div>
            )}
          </div>

          {/* Download UBL XML Button */}
          <div className="download-section">
            <button
              type="button"
              onClick={onApprove}
              disabled={isUpdating}
              className="download-ubl-button"
            >
              {isUpdating ? (
                <>⏳ UBL XML genereren...</>
              ) : (
                <>📥 Download Peppol UBL XML</>
              )}
            </button>
            <p className="download-hint">
              Het geüploade bestand is automatisch geconverteerd naar een Peppol-vriendelijke UBL XML.
              {mappingReport?.warnings?.some((w: string) => w.includes('AI')) && (
                <span className="ai-badge">🤖 AI-verbetering toegepast voor betere data extractie</span>
              )}
              Ontbrekende velden zijn automatisch ingevuld met standaardwaarden.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function OriginalInvoiceView({
  originalFile,
  invoice,
  validationReport,
  onUpdate,
  onApprove,
  isUpdating,
}: {
  originalFile: { data: string; mimeType: string; filename: string };
  invoice: any;
  validationReport: any;
  onUpdate: (invoice: any) => void;
  onApprove: () => void;
  isUpdating: boolean;
}) {
  const getFieldError = (fieldPath: string) => {
    return [...validationReport.errors, ...validationReport.warnings].find(
      (err: any) => err.fieldPath === fieldPath
    );
  };

  const fileUrl = `data:${originalFile.mimeType};base64,${originalFile.data}`;
  const isPDF = originalFile.mimeType === 'application/pdf';

  return (
    <div className="original-invoice-view">
      <div className="original-file-container">
        {isPDF ? (
          <iframe
            src={fileUrl}
            className="original-pdf-viewer"
            title="Originele factuur"
          />
        ) : (
          <div className="original-excel-viewer">
            <p>Excel bestand: {originalFile.filename}</p>
            <a
              href={fileUrl}
              download={originalFile.filename}
              className="download-original-button"
            >
              📥 Download origineel Excel bestand
            </a>
          </div>
        )}
      </div>

      {/* Floating edit panel for missing/incorrect fields */}
      <div className="original-edit-panel">
        <h3>Bewerk ontbrekende of incorrecte velden</h3>
        <div className="edit-fields-list">
          {getFieldError('Invoice.ID') && (
            <div className="edit-field-item">
              <label>Factuurnummer *</label>
              <input
                type="text"
                value={invoice.invoiceNumber || ''}
                onChange={(e) => onUpdate({ ...invoice, invoiceNumber: e.target.value })}
                placeholder="Factuurnummer"
                className="editable-field"
              />
              <span className="field-error-hint">⚠ {getFieldError('Invoice.ID')?.message.nl}</span>
            </div>
          )}

          {getFieldError('Invoice.IssueDate') && (
            <div className="edit-field-item">
              <label>Factuurdatum *</label>
              <input
                type="date"
                value={invoice.issueDate ? new Date(invoice.issueDate).toISOString().split('T')[0] : ''}
                onChange={(e) => onUpdate({ ...invoice, issueDate: e.target.value ? new Date(e.target.value) : undefined })}
                className="editable-field"
              />
              <span className="field-error-hint">⚠ {getFieldError('Invoice.IssueDate')?.message.nl}</span>
            </div>
          )}

          {getFieldError('Invoice.AccountingSupplierParty.Party.PartyName.Name') && (
            <div className="edit-field-item">
              <label>Leveranciersnaam *</label>
              <input
                type="text"
                value={invoice.supplier?.name || ''}
                onChange={(e) => onUpdate({
                  ...invoice,
                  supplier: { ...invoice.supplier, name: e.target.value }
                })}
                placeholder="Leveranciersnaam"
                className="editable-field"
              />
              <span className="field-error-hint">⚠ {getFieldError('Invoice.AccountingSupplierParty.Party.PartyName.Name')?.message.nl}</span>
            </div>
          )}

          {getFieldError('Invoice.AccountingSupplierParty.Party.PostalAddress.Country.IdentificationCode') && (
            <div className="edit-field-item">
              <label>Leverancier Landcode *</label>
              <input
                type="text"
                value={invoice.supplier?.address?.countryCode || 'BE'}
                onChange={(e) => onUpdate({
                  ...invoice,
                  supplier: {
                    ...invoice.supplier,
                    address: { ...invoice.supplier?.address, countryCode: e.target.value }
                  }
                })}
                placeholder="Landcode"
                className="editable-field"
                maxLength={2}
              />
              <span className="field-error-hint">⚠ {getFieldError('Invoice.AccountingSupplierParty.Party.PostalAddress.Country.IdentificationCode')?.message.nl}</span>
            </div>
          )}

          {getFieldError('Invoice.AccountingCustomerParty.Party.PartyName.Name') && (
            <div className="edit-field-item">
              <label>Klantnaam *</label>
              <input
                type="text"
                value={invoice.customer?.name || ''}
                onChange={(e) => onUpdate({
                  ...invoice,
                  customer: { ...invoice.customer, name: e.target.value }
                })}
                placeholder="Klantnaam"
                className="editable-field"
              />
              <span className="field-error-hint">⚠ {getFieldError('Invoice.AccountingCustomerParty.Party.PartyName.Name')?.message.nl}</span>
            </div>
          )}

          {validationReport.warnings.length === 0 && validationReport.errors.length === 0 && (
            <div className="no-issues-message">
              ✓ Alle velden zijn correct ingevuld
            </div>
          )}
        </div>

        <div className="approval-section">
          <button
            type="button"
            onClick={onApprove}
            disabled={isUpdating}
            className="approve-button"
          >
            {isUpdating ? (
              <>⏳ UBL XML genereren...</>
            ) : (
              <>✓ Goedkeuren en UBL XML downloaden</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ValidationItem({ error }: { error: ValidationError }) {
  return (
    <div className={`validation-item ${error.severity}`}>
      <div className="validation-item-header">
        <div className="validation-code">
          <code>{error.code}</code>
          {error.fieldPath && (
            <span className="field-path">
              <code>{error.fieldPath}</code>
            </span>
          )}
        </div>
      </div>
      <div className="validation-message">
        <div className="message-text">
          <strong>Nederlands:</strong> {error.message.nl}
        </div>
        <div className="message-text">
          <strong>English:</strong> {error.message.en}
        </div>
      </div>
      {error.suggestedFix && (
        <div className="suggested-fix">
          <strong>Suggestie:</strong> {error.suggestedFix}
        </div>
      )}
    </div>
  );
}
