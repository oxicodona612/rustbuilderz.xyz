/**
 * Faint specks drifting up the background, tinted with the accent color.
 * Particles are recycled rather than allocated, and the loop stops whenever
 * the tab is hidden.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  ttl: number;
  flicker: number;
}

const DENSITY = 1 / 22_000; // particles per CSS pixel of viewport area
const MAX_PARTICLES = 110;

function accentChannels(): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim() ||
    '244 244 245'
  );
}

export function startParticles(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d');
  if (!context) return;

  let width = 0;
  let height = 0;
  let particles: Particle[] = [];
  let frame = 0;
  let pointerX = -1;
  let pointerY = -1;
  const color = accentChannels();

  const spawn = (particle: Partial<Particle> = {}): Particle => ({
    x: Math.random() * width,
    y: height + Math.random() * 40,
    vx: (Math.random() - 0.5) * 0.12,
    vy: -(0.08 + Math.random() * 0.3),
    radius: 0.4 + Math.random() * 1.2,
    life: 0,
    ttl: 700 + Math.random() * 1100,
    flicker: Math.random() * Math.PI * 2,
    ...particle,
  });

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const target = Math.min(MAX_PARTICLES, Math.round(width * height * DENSITY));
    particles = particles.slice(0, target);
    while (particles.length < target) {
      // Spread the first batch over the whole screen instead of the bottom edge.
      particles.push(spawn({ y: Math.random() * height, life: Math.random() * 700 }));
    }
  };

  const draw = () => {
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = 'lighter';

    for (let index = 0; index < particles.length; index++) {
      const particle = particles[index]!;
      particle.life += 1;
      particle.flicker += 0.04;

      // Particles lean away from the pointer.
      if (pointerX >= 0) {
        const dx = particle.x - pointerX;
        const dy = particle.y - pointerY;
        const distance = Math.hypot(dx, dy);
        if (distance < 130 && distance > 0) {
          const push = (1 - distance / 130) * 0.3;
          particle.x += (dx / distance) * push;
          particle.y += (dy / distance) * push;
        }
      }

      particle.x += particle.vx + Math.sin(particle.flicker * 0.7) * 0.1;
      particle.y += particle.vy;

      if (particle.life > particle.ttl || particle.y < -20) {
        particles[index] = spawn();
        continue;
      }

      const fade = Math.min(1, particle.life / 80, (particle.ttl - particle.life) / 140);
      const alpha = Math.max(0, fade * (0.35 + Math.sin(particle.flicker) * 0.15));
      const glow = particle.radius * 5;

      const gradient = context.createRadialGradient(
        particle.x,
        particle.y,
        0,
        particle.x,
        particle.y,
        glow,
      );
      gradient.addColorStop(0, `rgb(${color} / ${alpha})`);
      gradient.addColorStop(0.3, `rgb(${color} / ${alpha * 0.3})`);
      gradient.addColorStop(1, `rgb(${color} / 0)`);
      context.fillStyle = gradient;
      context.fillRect(particle.x - glow, particle.y - glow, glow * 2, glow * 2);
    }

    frame = requestAnimationFrame(draw);
  };

  const start = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  };

  resize();
  start();

  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener(
    'pointermove',
    (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
    },
    { passive: true },
  );
  document.documentElement.addEventListener('pointerleave', () => {
    pointerX = -1;
    pointerY = -1;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(frame);
    else start();
  });
}
