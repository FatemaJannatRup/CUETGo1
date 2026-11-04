import { useNavigate } from 'react-router-dom'

export default function Welcome() {
  const navigate = useNavigate()
  return <div className="welcome-page">
    <div className="welcome-topline"><span className="auth-brand-mark">C</span><span>CUET<span className="auth-brand-accent">Go</span></span><span className="welcome-campus-tag">MADE FOR CUET</span></div>
    <div className="welcome-hero">
      <div className="welcome-illustration"><div className="welcome-orbit orbit-one"></div><div className="welcome-orbit orbit-two"></div><div className="welcome-emoji">🛺</div><span className="welcome-spark spark-one">✦</span><span className="welcome-spark spark-two">✧</span></div>
      <span className="auth-eyebrow">CAMPUS RIDES, TOGETHER</span>
      <h1>Your campus.<br/><span>Your people.</span><br/>One ride.</h1>
      <p>Share rickshaw rides across campus. Split fares, save money, and make every trip easier.</p>
    </div>
    <div className="welcome-bottom"><button onClick={() => navigate('/role')} className="welcome-cta">Get started <span>→</span></button><p>Simple · Safe · Shared</p></div>
  </div>
}
