import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import './Auth.css';

function Register({ onLogin }) {
  const [step, setStep] = useState('form'); // 'form' | 'otp'
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Step 1: Register and trigger OTP
      await api.post('/auth/register', formData);
      toast.success('OTP sent to your email!');
      setStep('otp');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Step 2: Verify OTP
      const response = await api.post('/auth/verify-otp', {
        email: formData.email,
        otp
      });
      toast.success('Verification successful!');
      onLogin(response.data.token);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Chatbot Platform</h1>
        <h2>{step === 'form' ? 'Register' : 'Verify Email'}</h2>

        {step === 'form' ? (
          <form onSubmit={handleRegister}>
            <div className="form-group">
              <label htmlFor="name">Name (Optional)</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={6}
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Sending OTP...' : 'Register'}
            </button>
            <p className="auth-link">
              Already have an account? <Link to="/login">Login</Link>
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerify}>
            <div className="form-group">
              <p style={{ textAlign: 'center', marginBottom: '1rem' }}>
                Enter the code sent to <strong>{formData.email}</strong>
              </p>
              <label htmlFor="otp">Verification Code</label>
              <input
                type="text"
                id="otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
                placeholder="000000"
                maxLength={6}
                style={{ textAlign: 'center', letterSpacing: '0.5rem', fontSize: '1.2rem' }}
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Verifying...' : 'Verify Email'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setStep('form')}
              style={{ marginTop: '1rem', background: 'transparent', color: '#666' }}
            >
              Back to Registration
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default Register;

