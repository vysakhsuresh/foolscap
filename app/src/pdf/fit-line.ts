/**
 * How a changed line `natural` points wide is fitted into `room`: squeezed
 * sideways to no less than 85% (the eye barely sees it), then made smaller.
 * Never stretched. Shared by the editor's preview and the writer, so what is
 * shown is what is written.
 */
export function fitLine(natural: number, room: number): { squeeze: number; scale: number } {
  if (!(room > 0) || natural <= room) return { squeeze: 100, scale: 1 };
  const squeeze = Math.max(85, Math.floor((100 * room) / natural));
  const squeezed = (natural * squeeze) / 100;
  return { squeeze, scale: squeezed > room ? Math.max(0.5, room / squeezed) : 1 };
}
