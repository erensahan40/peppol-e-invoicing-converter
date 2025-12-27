import { useState, useEffect } from 'react';
import { signIn, getSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';

export default function SignInPage() {
  const router = useRouter();
  const { callbackUrl } = router.query;
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Check if already signed in
    getSession().then((session) => {
      if (session) {
        router.push((callbackUrl as string) || '/');
      }
    });
  }, [callbackUrl, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await signIn('email', {
        email,
        redirect: false,
        callbackUrl: (callbackUrl as string) || '/',
      });

      if (result?.error) {
        // Provide more specific error messages
        if (result.error.includes('SMTP') || result.error.includes('email') || result.error.includes('configuration')) {
          setError('SMTP configuratie ontbreekt of is onjuist. Controleer je .env bestand met SMTP instellingen.');
        } else {
          setError('Er is een fout opgetreden bij het verzenden van de email. Probeer het opnieuw.');
        }
        console.error('SignIn error:', result.error);
      } else {
        setSuccess(true);
      }
    } catch (err: any) {
      const errorMessage = err?.message || 'Er is een fout opgetreden. Probeer het opnieuw.';
      setError(errorMessage);
      console.error('SignIn exception:', err);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <>
        <Head>
          <title>Check je email - Peppol Converter</title>
        </Head>
        <div className="signin-container">
          <div className="signin-wrapper">
            <div className="signin-success-card">
              <div className="signin-success-icon">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              
              <h1 className="signin-success-title">Check je email</h1>
              
              <p className="signin-success-text">
                We hebben een login link gestuurd naar:
              </p>
              
              <div className="signin-success-email">{email}</div>
              
              <div className="signin-success-instruction">
                <div className="signin-success-instruction-title">Volg deze stappen:</div>
                <ul className="signin-success-instruction-list">
                  <li>Open je email inbox</li>
                  <li>Klik op de login link in de email</li>
                  <li>Je wordt automatisch ingelogd</li>
                </ul>
              </div>

              <div className="signin-success-footer">
                <Link href="/" className="signin-footer-link">
                  <span className="signin-footer-link-icon">←</span>
                  Terug naar home
                </Link>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Login - Peppol Converter</title>
      </Head>
      <div className="signin-container">
        <div className="signin-wrapper">
          <div className="signin-card">
            <div className="signin-header">
              <div className="signin-logo">
                <span className="signin-logo-icon">🔐</span>
              </div>
              <h1 className="signin-title">Welkom terug</h1>
              <p className="signin-subtitle">
                Log in om volledige conversies te downloaden en al je facturen te beheren
              </p>
            </div>

            <form onSubmit={handleSubmit} className="signin-form">
              <div className="signin-form-group">
                <label htmlFor="email" className="signin-label">
                  <span>📧</span>
                  Email adres
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="signin-input"
                  placeholder="voorbeeld@email.com"
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="signin-error">
                  <span className="signin-error-icon">⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="signin-button"
              >
                {loading ? (
                  <>
                    <div className="signin-button-spinner"></div>
                    <span className="signin-button-text">Verzenden...</span>
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    <span className="signin-button-text">Stuur magic link</span>
                  </>
                )}
              </button>
            </form>

            <div className="signin-footer">
              <Link href="/" className="signin-footer-link">
                <span className="signin-footer-link-icon">←</span>
                Terug naar home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

