import { useNavigate } from 'react-router-dom';
import { LogoMark } from '../ui/brand';
import { Button } from '../ui/primitives';

/**
 * The installed app, without an account: the brand and the way in. In the browser the
 * landing does this job; here (or offline) a short screen is enough.
 */
export default function Welcome() {
  const navigate = useNavigate();
  return (
    <main className="welcome">
      <div className="welcome-brand">
        <LogoMark size={72} />
        <h1 className="welcome-name">Anilha</h1>
        <p className="t-regular t-muted welcome-lead">
          Seu treino da semana, montado. Cada série, num toque.
        </p>
      </div>
      <div className="welcome-actions">
        <Button variant="primary" block onClick={() => navigate('/entrar')}>
          Entrar
        </Button>
        {navigator.onLine ? (
          <a className="hb-btn-link" href="/conheca/">
            Conhecer o Anilha
          </a>
        ) : null}
      </div>
    </main>
  );
}
