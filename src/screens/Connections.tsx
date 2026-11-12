import { Link } from 'react-router-dom';
import { Widget } from '../ui/primitives';

export default function Connections() {
  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Conexões</h1>
      </header>
      <Widget title="CRUNNING" sub="Corrida e musculação na mesma semana">
        <Link className="hb-btn hb-btn-outline" to="/voce/conexoes/crunning">
          CRUNNING
        </Link>
      </Widget>
    </>
  );
}
