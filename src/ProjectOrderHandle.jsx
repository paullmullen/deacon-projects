import { useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function ProjectOrderHandle({ project, disabled, onMove, onTarget }) {
  const drag = useRef(null);
  const [pointer, setPointer] = useState(null);
  const finish = (event, cancel = false) => {
    if (!drag.current) return;
    const target = drag.current.target;
    drag.current = null;
    setPointer(null);
    onTarget(null);
    if (!cancel && target && target !== project.id) onMove(project.id, target);
  };
  return <>
  <button type="button" className="project-order-handle"
    aria-label={`Reorder ${project.title || "Untitled project"}`}
    aria-describedby="project-order-help" disabled={disabled}
    onKeyDown={event => {
      const direction = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
      if (direction) { event.preventDefault(); onMove(project.id, null, direction); }
      if (event.key === "Escape") finish(event, true);
    }}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { target: null };
      setPointer({ x: event.clientX, y: event.clientY });
    }}
    onPointerMove={event => {
      if (!drag.current) return;
      setPointer({ x: event.clientX, y: event.clientY });
      const card = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-project-id]");
      const target = card?.dataset.projectStatus === project.status ? card.dataset.projectId : null;
      drag.current.target = target;
      onTarget(target && target !== project.id ? target : null);
    }}
    onPointerUp={finish} onPointerCancel={event => finish(event, true)}
    onLostPointerCapture={event => finish(event, true)}
    style={{ cursor: pointer ? "grabbing" : "grab" }}>
      <span aria-hidden="true">⠿</span>
  </button>
  {pointer && createPortal(<div className="project-order-preview" aria-hidden="true"
    style={{ left: pointer.x + 12, top: pointer.y + 12 }}>{project.title || "Untitled project"}</div>, document.body)}
  </>;
}
