/**
 * CICLAPP — Helpers compartidos de bicicletas
 * constants/bicicletas.ts
 *
 * El backend solo acepta "Carretera" | "Urbana" | "Electrica".
 * En la app "Montaña" se guarda como "Carretera".
 */

export type TipoLabel = "Urbana" | "Montaña" | "Eléctrica";
export type TipoBackend = "Carretera" | "Urbana" | "Electrica";

const FOTOS = {
  montana: require("../assets/images/bici-montana.png"),
  urbana: require("../assets/images/bici-urbana.png"),
  electrica: require("../assets/images/bici-electrica.png"),
};

export const TIPOS_LABEL: TipoLabel[] = ["Urbana", "Montaña", "Eléctrica"];

/** Del valor guardado (backend o local) → etiqueta, foto y descripción */
export function infoTipo(tipo: string): {
  label: TipoLabel;
  foto: any;
  descripcion: string;
} {
  const t = (tipo || "").toLowerCase();
  if (t === "carretera" || t === "montana" || t === "montaña")
    return {
      label: "Montaña",
      foto: FOTOS.montana,
      descripcion: "Bicicleta de montaña ideal para terrenos irregulares y rutas de aventura.",
    };
  if (t === "electrica" || t === "eléctrica")
    return {
      label: "Eléctrica",
      foto: FOTOS.electrica,
      descripcion: "Bicicleta eléctrica con motor de asistencia para recorrer más con menos esfuerzo.",
    };
  return {
    label: "Urbana",
    foto: FOTOS.urbana,
    descripcion: "Bicicleta urbana ideal para moverte por la ciudad y la ciclovía.",
  };
}

/** De la etiqueta que ve el usuario → valor que acepta el backend */
export function tipoParaBackend(label: TipoLabel): TipoBackend {
  if (label === "Montaña") return "Carretera";
  if (label === "Eléctrica") return "Electrica";
  return "Urbana";
}
