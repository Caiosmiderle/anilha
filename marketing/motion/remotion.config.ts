import path from 'node:path';
import { Config } from '@remotion/cli/config';

// WebGL no render: ANGLE usa a GPU do Windows pelo Direct3D; sem ele o Chrome headless
// cai no SwiftShader ou recusa o contexto e o 3D sai preto.
Config.setChromiumOpenGlRenderer('angle');

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setCodec('h264');
Config.setCrf(15);
Config.setPixelFormat('yuv420p');

// As telas usam os componentes do próprio app (../../src). Os módulos do app e os do vídeo
// têm que ver um React só, um three só e um lucide só.
const here = (p: string) => path.resolve(process.cwd(), 'node_modules', p);
Config.overrideWebpackConfig((c) => ({
  ...c,
  resolve: {
    ...c.resolve,
    alias: {
      ...(c.resolve?.alias as Record<string, string> | undefined),
      react: here('react'),
      'react-dom': here('react-dom'),
      'lucide-react': here('lucide-react'),
      three: here('three'),
    },
  },
}));
