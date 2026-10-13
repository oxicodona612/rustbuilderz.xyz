const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

/**
 * A soft light that follows the pointer across `[data-spotlight]` cards. One
 * listener covers cards that are added later, such as live activities.
 */
export function initSpotlight(): void {
  if (!finePointer.matches) return;

  document.addEventListener(
    'pointermove',
    (event) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>('[data-spotlight]');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--sx', `${event.clientX - rect.left}px`);
      card.style.setProperty('--sy', `${event.clientY - rect.top}px`);
    },
    { passive: true },
  );
}

/** Types through `data-typer` strings, one after another. */
export function initTyper(): void {
  for (const element of document.querySelectorAll<HTMLElement>('[data-typer]')) {
    const output = element.querySelector<HTMLElement>('[data-typer-text]');
    const lines = JSON.parse(element.dataset.typer ?? '[]') as string[];
    if (!output || lines.length < 2 || reducedMotion.matches) continue;

    let line = 0;
    let length = lines[0]!.length;
    let deleting = true;

    const step = () => {
      if (deleting) {
        length -= 1;
        if (length === 0) {
          deleting = false;
          line = (line + 1) % lines.length;
        }
      } else {
        length += 1;
      }

      const current = lines[line]!;
      output.textContent = current.slice(0, length);

      if (!deleting && length === current.length) {
        deleting = true;
        setTimeout(step, 2600);
        return;
      }
      setTimeout(step, deleting ? 28 : 55 + Math.random() * 60);
    };

    setTimeout(step, 3200);
  }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

function toast(message: string): void {
  const element = document.querySelector<HTMLElement>('[data-toast]');
  if (!element) return;
  element.textContent = message;
  element.dataset.visible = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => delete element.dataset.visible, 2200);
}

/** Buttons with `data-copy` put their value on the clipboard. */
export function initCopy(): void {
  document.addEventListener('click', async (event) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>('[data-copy]');
    const value = button?.dataset.copy;
    if (!button || !value) return;

    try {
      await navigator.clipboard.writeText(value);
      toast(`Copied ${value}`);
      button.dataset.copied = '';
      setTimeout(() => delete button.dataset.copied, 1500);
    } catch {
      toast(`Copy failed. It's ${value}`);
    }
  });
}
