import { G, Path, Svg } from '@react-pdf/renderer';
import { BRAND_SVG } from '@/components/brand-svg';

export const TEAL = '#466c67';
export const PULSE = '#662b1d';
export const CLAY = '#a35038';
export const CREAM = '#f8eadb';
export const INK = '#231f1f';
export const LINE = '#e8ddd0';

export function LogoMark({ width, color = CREAM }: { width: number; color?: string }) {
  const { viewBox, paths } = BRAND_SVG['logo-combination'];
  const [, , w, h] = viewBox.split(' ').map(Number);
  const shapes = [...paths.matchAll(/<path(?: transform="translate\(([-\d.]+) ([-\d.]+)\)")? d="([^"]+)"\/>/g)];
  return (
    <Svg viewBox={viewBox} style={{ width, height: (width * h) / w }}>
      {shapes.map((m, i) =>
        m[1] ? (
          <G key={i} transform={`translate(${m[1]} ${m[2]})`}>
            <Path d={m[3]} fill={color} />
          </G>
        ) : (
          <Path key={i} d={m[3]} fill={color} />
        )
      )}
    </Svg>
  );
}
