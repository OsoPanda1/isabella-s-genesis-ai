export type DecisionRisk = "L0" | "L1" | "L2" | "L3" | "L4";

export interface DecisionDisclosure {
  risk: DecisionRisk;
  requiresHumanReview: boolean;
  automaticExecutionAllowed: boolean;
  message: string;
}

const BASE_MESSAGE =
  "Isabella proporciona información y recomendaciones generadas por IA; no constituyen por sí mismas una decisión, garantía ni asesoría profesional. La persona usuaria debe revisar la información y decidir cómo actuar.";

export function decisionDisclosure(risk: DecisionRisk): DecisionDisclosure {
  switch (risk) {
    case "L0":
      return {
        risk,
        requiresHumanReview: false,
        automaticExecutionAllowed: false,
        message: BASE_MESSAGE,
      };
    case "L1":
      return {
        risk,
        requiresHumanReview: true,
        automaticExecutionAllowed: false,
        message: BASE_MESSAGE,
      };
    case "L2":
      return {
        risk,
        requiresHumanReview: true,
        automaticExecutionAllowed: false,
        message: `${BASE_MESSAGE} Verifica especialmente la información antes de una decisión material.`,
      };
    case "L3":
      return {
        risk,
        requiresHumanReview: true,
        automaticExecutionAllowed: false,
        message: `${BASE_MESSAGE} Esta operación requiere aprobación humana explícita y auditable.`,
      };
    case "L4":
      return {
        risk,
        requiresHumanReview: true,
        automaticExecutionAllowed: false,
        message: `${BASE_MESSAGE} Las operaciones irreversibles o destructivas están bloqueadas por defecto.`,
      };
  }
}
