import { useRef, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

interface Props {
  children: ReactNode;
  className?: string;
  intensity?: number; // max tilt degrees
}

// Glass card with subtle mouse-based 3D tilt and dynamic lighting.
export default function TiltCard({ children, className = '', intensity = 6 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [intensity, -intensity]), { stiffness: 150, damping: 20 });
  const ry = useSpring(useTransform(mx, [0, 1], [-intensity, intensity]), { stiffness: 150, damping: 20 });
  const gx = useTransform(mx, [0, 1], ['0%', '100%']);
  const gy = useTransform(my, [0, 1], ['0%', '100%']);

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width);
    my.set((e.clientY - r.top) / r.height);
  };
  const onLeave = () => {
    mx.set(0.5);
    my.set(0.5);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d', transformPerspective: 1000 }}
      className={`glass glass-hover rounded-none relative overflow-hidden ${className}`}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background: useTransform(
            [gx, gy],
            ([x, y]) =>
              `radial-gradient(400px circle at ${x} ${y}, rgba(14,159,110,0.08), transparent 60%)`,
          ),
        }}
      />
      <div style={{ transform: 'translateZ(0)' }}>{children}</div>
    </motion.div>
  );
}
