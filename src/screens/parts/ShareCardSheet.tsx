import { Download, Share2 } from 'lucide-react';
import { useMemo } from 'react';
import { canShareFiles } from '../../lib/files';
import type { ShareCardData } from '../../lib/shareCard';
import { cardBlob, drawShareCard } from '../../lib/shareCardImage';
import { Sheet, useToast } from '../../ui/overlays';
import { Button } from '../../ui/primitives';

/**
 * The image of a finished workout, to post. On the phone, one button opens the share menu,
 * where the iPhone also has "Salvar imagem" (a direct download does nothing there); holding
 * the picture works too. Where there is no share menu (a computer), the image downloads.
 */
export function ShareCardSheet({
  card,
  fileName,
  onClose,
}: {
  card: ShareCardData;
  fileName: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const canvas = useMemo(() => drawShareCard(card), [card]);
  // A data URL: the page policy allows data images, not blob ones.
  const url = useMemo(() => canvas.toDataURL('image/png'), [canvas]);
  const shareable = useMemo(() => canShareFiles(), []);

  function download() {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    toast.show('Imagem baixada');
  }

  async function share() {
    const file = new File([await cardBlob(canvas)], fileName, { type: 'image/png' });
    try {
      await navigator.share({ files: [file] });
    } catch (err) {
      if ((err as Error).name !== 'AbortError')
        toast.show('Não deu para abrir o menu. Toque e segure a imagem para salvar.', {
          error: true,
        });
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Compartilhar treino"
      actions={
        shareable ? (
          <Button variant="primary" block icon={Share2} onClick={() => void share()}>
            Compartilhar ou salvar
          </Button>
        ) : (
          <Button variant="primary" block icon={Download} onClick={download}>
            Baixar imagem
          </Button>
        )
      }
    >
      <div className="stack">
        <img
          className="sharecard-preview"
          src={url}
          width={1080}
          height={1920}
          alt={`Imagem do treino ${card.title}, de ${card.date}`}
        />
        {shareable ? (
          <p className="t-caption" style={{ margin: 0, textAlign: 'center' }}>
            No iPhone, Salvar imagem fica nesse menu. Também dá para tocar e segurar a imagem.
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
