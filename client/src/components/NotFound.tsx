import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Compass, ArrowLeft } from 'lucide-react';

export function NotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
      <Compass size={48} style={{ margin: '0 auto 1rem', color: 'var(--text-muted)' }} />
      <h1>{t('common:notFound.title')}</h1>
      <p className="text-muted">{t('common:notFound.description')}</p>
      <button
        className="btn btn-primary"
        style={{ marginTop: '1.5rem' }}
        onClick={() => navigate('/dashboard')}
      >
        <ArrowLeft size={16} />
        {t('common:notFound.back')}
      </button>
    </div>
  );
}
