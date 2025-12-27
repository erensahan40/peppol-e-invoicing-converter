import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

export default function PricingPage() {
  const router = useRouter();
  const { conversionId } = router.query;
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Handle scroll for sticky header
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Smooth scroll to section (for footer links)
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

  const handleCheckout = async (type: 'one_off' | 'subscription') => {
    if (!session) {
      router.push(`/auth/signin?callbackUrl=/pricing${conversionId ? `?conversionId=${conversionId}` : ''}`);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          conversionId: conversionId || null,
        }),
      });

      const data = await response.json();

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        alert('Checkout failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Checkout failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Prijzen - Peppol Converter</title>
        <meta name="description" content="Kies het juiste plan voor jouw Peppol conversie behoeften. Betaal alleen bij succesvolle conversie. Gratis, Pay-per-use of Unlimited abonnement." />
      </Head>

      <div className="app-container">
        {/* Navigation Header */}
        <header className={`landing-header ${scrolled ? 'scrolled' : ''}`}>
          <nav className="nav-container">
            <Link href="/" className="nav-logo">
              <span className="nav-logo-icon">📄</span>
              <span className="nav-logo-text">Peppol Converter</span>
            </Link>
            
            {/* Desktop Navigation */}
            <ul className="nav-menu">
              <li>
                <Link href="/#features" className="nav-link">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/#how-it-works" className="nav-link">
                  Hoe het werkt
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="nav-link">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/#converter" className="nav-link nav-link-cta">
                  Converter
                </Link>
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
              <Link href="/" className="nav-cta-button">
                Start Nu
              </Link>
            </div>
          </nav>

          {/* Mobile Menu */}
          <div className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`}>
            <ul className="mobile-menu-list">
              <li>
                <Link href="/#features" className="mobile-nav-link">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/#how-it-works" className="mobile-nav-link">
                  Hoe het werkt
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="mobile-nav-link">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/#converter" className="mobile-nav-link mobile-nav-cta">
                  Start Converter
                </Link>
              </li>
            </ul>
          </div>
        </header>

        <main className="landing-main">
          {/* Pricing Hero Section */}
          <section className="pricing-hero-section">
            <div className="section-container">
              <div className="pricing-header">
                <h1 className="pricing-title">Kies je Plan</h1>
                <p className="pricing-subtitle">
                  Je betaalt alleen bij een succesvolle conversie
                </p>
              </div>

              {/* Pricing Cards */}
              <div className="pricing-grid">
                {/* Free Plan */}
                <div className="pricing-card">
                  <div className="pricing-card-header">
                    <h2 className="pricing-card-title">Gratis</h2>
                    <div className="pricing-card-price">
                      <span className="price-amount">€0</span>
                    </div>
                  </div>
                  <ul className="pricing-features">
                    <li className="pricing-feature">
                      <span className="feature-icon">✓</span>
                      <span>3 gratis conversies</span>
                    </li>
                    <li className="pricing-feature">
                      <span className="feature-icon">✓</span>
                      <span>Geen account nodig</span>
                    </li>
                    <li className="pricing-feature">
                      <span className="feature-icon">✓</span>
                      <span>Preview & validatie</span>
                    </li>
                  </ul>
                  <div className="pricing-card-footer">
                    <p className="pricing-note">
                      Geen account nodig om te proberen.
                    </p>
                    <Link href="/" className="pricing-button pricing-button-secondary">
                      Start Gratis
                    </Link>
                  </div>
                </div>

                {/* Pay-per-use - Popular */}
                <div className="pricing-card pricing-card-popular">
                  <div className="popular-badge">Populair</div>
                  <div className="pricing-card-header">
                    <h2 className="pricing-card-title">Pay-per-use</h2>
                    <div className="pricing-card-price">
                      <span className="price-amount">€2</span>
                      <span className="price-period">per conversie</span>
                    </div>
                  </div>
                  <ul className="pricing-features">
                    <li className="pricing-feature">
                      <span className="feature-icon">✓</span>
                      <span>€2 per succesvolle conversie</span>
                    </li>
                    <li className="pricing-feature">
                      <span className="feature-icon">✓</span>
                      <span>Geen maandelijkse kosten</span>
                    </li>
                    <li className="pricing-feature">
                      <span className="feature-icon">✓</span>
                      <span>Download volledige UBL</span>
                    </li>
                    <li className="pricing-feature">
                      <span className="feature-icon">✓</span>
                      <span>Account vereist</span>
                    </li>
                  </ul>
                  <div className="pricing-card-footer">
                    <p className="pricing-note">
                      Account vereist om te downloaden.
                    </p>
                    <button
                      onClick={() => handleCheckout('one_off')}
                      disabled={loading}
                      className="pricing-button pricing-button-primary"
                    >
                      {loading ? (
                        <>
                          <span className="button-spinner"></span>
                          Processing...
                        </>
                      ) : (
                        'Koop 1 Credit'
                      )}
                    </button>
                  </div>
                </div>

                {/* Unlimited */}
                <div className="pricing-card">
                  <div className="pricing-card-header">
                    <h2 className="pricing-card-title">Unlimited</h2>
                    <div className="pricing-card-price">
                      <span className="price-amount">€20</span>
                      <span className="price-period">per maand</span>
                    </div>
                  </div>
                  <ul className="pricing-features">
                    <li className="pricing-feature">
                      <span className="feature-icon">✓</span>
                      <span>Onbeperkte conversies</span>
                    </li>
                    <li className="pricing-feature">
                      <span className="feature-icon">✓</span>
                      <span>Download volledige UBL</span>
                    </li>
                    <li className="pricing-feature">
                      <span className="feature-icon">✓</span>
                      <span>Maandelijks abonnement</span>
                    </li>
                    <li className="pricing-feature">
                      <span className="feature-icon">✓</span>
                      <span>Account vereist</span>
                    </li>
                  </ul>
                  <div className="pricing-card-footer">
                    <p className="pricing-note">
                      Je betaalt alleen bij een succesvolle conversie.
                    </p>
                    <button
                      onClick={() => handleCheckout('subscription')}
                      disabled={loading}
                      className="pricing-button pricing-button-primary pricing-button-dark"
                    >
                      {loading ? (
                        <>
                          <span className="button-spinner"></span>
                          Processing...
                        </>
                      ) : (
                        'Kies Unlimited'
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* FAQ Section */}
              <div className="pricing-faq">
                <h3 className="pricing-faq-title">Veelgestelde Vragen</h3>
                <div className="pricing-faq-grid">
                  <div className="pricing-faq-item">
                    <h4 className="faq-question">Wanneer moet ik betalen?</h4>
                    <p className="faq-answer">
                      Je betaalt alleen wanneer je een succesvolle conversie downloadt. Gratis conversies tellen niet mee.
                    </p>
                  </div>
                  <div className="pricing-faq-item">
                    <h4 className="faq-question">Hoe werken gratis conversies?</h4>
                    <p className="faq-answer">
                      Je krijgt 3 gratis conversies zonder account. Je kunt preview en validatie zien, maar download vereist een account.
                    </p>
                  </div>
                  <div className="pricing-faq-item">
                    <h4 className="faq-question">Kan ik credits bewaren?</h4>
                    <p className="faq-answer">
                      Ja, gekochte credits blijven geldig tot je ze gebruikt.
                    </p>
                  </div>
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
                        <Link href="/#features">
                          <span>Features</span>
                        </Link>
                      </li>
                      <li>
                        <Link href="/#how-it-works">
                          <span>Hoe het werkt</span>
                        </Link>
                      </li>
                      <li>
                        <Link href="/#converter">
                          <span>Start Converter</span>
                        </Link>
                      </li>
                      <li>
                        <Link href="/#faq">
                          <span>Veelgestelde Vragen</span>
                        </Link>
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

