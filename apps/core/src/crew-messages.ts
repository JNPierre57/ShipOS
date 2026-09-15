import type { DomainEvent } from "../../../packages/contracts/src/index.js";
import type { PresentationDefinition } from "../../../packages/module-sdk/src/index.js";
import type { Store } from "./store.js";
import type { Department } from "./crew-model.js";
// Factual detail comes from the already validated SYSTEM presentation, never from chat.
export const crewBanks = {
  biology: [
    "Analyse biologique reçue. Je l'ajoute au relevé.",
    "Le dossier biologique vient d'être complété.",
    "Nouvelle analyse biologique au journal scientifique.",
    "J'ai reçu les résultats de l'analyse biologique.",
    "Mise à jour du relevé biologique disponible.",
    "Les données de cette analyse sont consignées.",
    "Rapport biologique prêt pour la passerelle.",
    "Le suivi des analyses biologiques est à jour.",
    "Résultats biologiques enregistrés pour cette session.",
    "Je transmets le dernier relevé d'analyse biologique.",
    "L'analyse rejoint nos observations de terrain.",
    "Une nouvelle entrée complète le journal biologique.",
  ],
  valuable: [
    "Analyse à forte valeur estimée. Le montant de base figure au relevé.",
    "Résultat biologique notable. L'estimation reste hors bonus.",
    "Cette analyse mérite un signalement pour sa valeur de base estimée.",
    "Je transmets une analyse biologique à forte valeur estimée.",
    "Relevé précieux enregistré. Il s'agit d'une estimation de base.",
    "La valeur de base estimée de cette analyse est notable.",
    "Rapport biologique prioritaire au sein du relevé scientifique.",
    "Analyse précieuse au journal. Aucun bonus n'est inclus dans l'estimation.",
    "Les résultats disponibles indiquent une analyse à forte valeur de base.",
    "Je signale ce résultat biologique et son estimation hors bonus.",
    "Le relevé scientifique compte une analyse à valeur estimée élevée.",
    "Estimation biologique notable reçue pour la passerelle.",
  ],
  remarkable: [
    "Ce corps présente une caractéristique remarquable dans nos relevés.",
    "Observation notable. Je transmets les données disponibles.",
    "Un résultat du relevé mérite l'attention de la passerelle.",
    "Caractéristique remarquable consignée au journal scientifique.",
    "Je signale ce corps au titre des observations remarquables.",
    "Le relevé fait ressortir une caractéristique notable.",
    "Données remarquables reçues pour ce corps céleste.",
    "Ce résultat complète notre relevé des corps remarquables.",
    "Rapport d'observation prêt. Les détails figurent au relevé.",
    "Une entrée notable vient compléter les données du scan.",
    "Je transmets le dernier signalement scientifique remarquable.",
    "Les observations disponibles justifient ce signalement.",
  ],
  survey: [
    "Le relevé des scans de la session progresse.",
    "Nouvelles données de scan ajoutées au journal.",
    "Bilan des observations disponible pour la passerelle.",
    "Le suivi scientifique a reçu de nouveaux scans.",
    "Je transmets le point sur les scans enregistrés.",
    "Le compteur des événements de scan est à jour.",
    "Les dernières observations complètent le relevé.",
    "Rapport de suivi des scans prêt.",
    "Notre journal scientifique compte de nouvelles observations.",
    "Mise à jour du bilan de scan disponible.",
    "J'ai consigné la progression des scans reçus.",
    "Le relevé de la session s'enrichit de nouveaux scans.",
  ],
  travel: [
    "Bilan de navigation à jour. Les sauts reçus sont consignés.",
    "Le journal de transit compte de nouveaux sauts.",
    "Je transmets la progression du transit observé.",
    "Point de navigation disponible pour cette session.",
    "Les derniers sauts complètent le journal de bord.",
    "Le suivi du transit a progressé.",
    "Les déplacements reçus sont reportés au bilan.",
    "Rapport de navigation prêt pour la passerelle.",
    "Le compteur des sauts observés est à jour.",
    "Nouvelle étape dans le relevé de navigation.",
    "Je consigne la suite du transit dans nos relevés.",
    "Mise à jour du journal de navigation disponible.",
  ],
  return: [
    "Nous retrouvons un système déjà présent dans nos relevés.",
    "Système connu. La précédente observation figure au journal.",
    "Retour dans un système mémorisé par ShipOS.",
    "J'ai retrouvé ce système dans notre historique de navigation.",
    "Une ancienne entrée de navigation correspond à ce système.",
    "Le journal confirme une précédente observation de ce système.",
  ],
  vessel: [
    "Le vaisseau suivi vient de changer. Voici les références disponibles.",
    "Mise à jour du vaisseau dans le suivi technique.",
    "Les références du vaisseau ont été reçues.",
    "Je transmets le relevé du vaisseau actuellement suivi.",
    "Le dossier du vaisseau est à jour dans ShipOS.",
    "Rapport technique disponible sur ce vaisseau.",
  ],
  build: [
    "Configuration reçue. Je transmets les éléments observés.",
    "Le relevé technique de la configuration est à jour.",
    "Une signature de configuration a été consignée.",
    "Les données de configuration rejoignent le suivi technique.",
    "Rapport de configuration disponible pour la passerelle.",
    "J'ai reçu le dernier état documenté de l'équipement.",
    "Point technique sur la configuration observée.",
    "La configuration figure désormais dans nos relevés.",
  ],
  fuel: [
    "Signal de réserve basse reçu. Ravitaillement recommandé.",
    "Carburant sous le seuil signalé par le vaisseau. Prévoir le ravitaillement.",
    "La réserve de carburant appelle votre attention.",
    "Avertissement de carburant confirmé par la télémétrie reçue.",
    "Le vaisseau signale une réserve basse. Vérifiez le prochain ravitaillement.",
    "Réserve basse au dernier relevé. Pensez au ravitaillement.",
    "Je transmets l'alerte carburant du vaisseau.",
    "Le seuil d'avertissement carburant est franchi.",
  ],
  engineering: [
    "Une opération d'ingénierie a été consignée au journal.",
    "Le suivi des opérations d'ingénierie est à jour.",
    "Je transmets le bilan d'ingénierie disponible.",
    "Le journal technique contient une nouvelle opération d'ingénierie.",
    "Relevé d'ingénierie reçu pour cette session.",
    "Point technique disponible sur les opérations d'ingénierie observées.",
  ],
  outfitting: [
    "Le journal fait état d'une opération d'équipement.",
    "Mise à jour du suivi des opérations d'équipement.",
    "Je transmets le bilan d'équipement observé.",
    "Nouvelle opération d'équipement consignée.",
    "Les opérations d'équipement reçues complètent le suivi technique.",
    "Rapport disponible sur les opérations d'équipement de la session.",
  ],
  mining: [
    "Raffinage consigné. Le bilan de la session est à jour.",
    "Un événement de raffinage a rejoint le journal.",
    "Je transmets le suivi des opérations de raffinage.",
    "Le journal technique compte une nouvelle entrée de raffinage.",
    "Point disponible sur le raffinage observé.",
    "Les données de raffinage reçues complètent le bilan.",
  ],
  combat: [
    "Des récompenses de combat ont été signalées au journal.",
    "Le bilan des récompenses de combat observées est à jour.",
    "Je transmets les récompenses de combat consignées.",
    "Nouvelles entrées au relevé des récompenses de combat.",
    "Le journal de la session contient des récompenses de combat.",
    "Point tactique sur les récompenses effectivement reçues.",
    "Les récompenses signalées complètent le bilan de combat.",
    "Rapport de récompenses de combat disponible.",
    "Je consigne les dernières récompenses au suivi tactique.",
    "Mise à jour du relevé des récompenses de la session.",
    "Le suivi tactique a reçu de nouveaux événements de récompense.",
    "Voici le bilan documenté des récompenses de combat.",
  ],
  srv: [
    "Déploiement de SRV consigné au journal de navigation.",
    "Le suivi des déploiements de SRV est à jour.",
    "Je transmets le relevé des sorties en SRV.",
    "Nouvelle entrée de déploiement SRV dans cette session.",
    "Point disponible sur les déploiements de SRV observés.",
    "Les déploiements reçus complètent le journal des déplacements.",
  ],
  onFoot: [
    "Débarquement consigné au journal des déplacements.",
    "Le suivi des débarquements est à jour.",
    "Je transmets le relevé des débarquements observés.",
    "Une nouvelle entrée complète le suivi à pied.",
    "Point de navigation sur les débarquements de cette session.",
    "Les événements de débarquement reçus sont consignés.",
  ],
} as const;
export type CrewFamily = keyof typeof crewBanks;
export const crewRouting: Record<
  string,
  { department: Department; bank: CrewFamily }
> = {
  "elite.exobiology.highValueDiscovery": {
    department: "SCI",
    bank: "valuable",
  },
  "elite.exploration.remarkableBody": { department: "SCI", bank: "remarkable" },
  "elite.ship.fuel.low": { department: "ENG", bank: "fuel" },
  "shipos.context.loadout.novel": { department: "ENG", bank: "build" },
  "editorial:exobiology": { department: "SCI", bank: "biology" },
  "editorial:exploration": { department: "SCI", bank: "survey" },
  "editorial:travel": { department: "NAV", bank: "travel" },
  "editorial:system-return": { department: "NAV", bank: "return" },
  "editorial:ship-return": { department: "ENG", bank: "vessel" },
  "editorial:ship-change": { department: "ENG", bank: "vessel" },
  "editorial:engineering": { department: "ENG", bank: "engineering" },
  "editorial:outfitting": { department: "ENG", bank: "outfitting" },
  "editorial:mining": { department: "ENG", bank: "mining" },
  "editorial:combat": { department: "TAC", bank: "combat" },
  "editorial:srv": { department: "NAV", bank: "srv" },
  "editorial:onFoot": { department: "NAV", bank: "onFoot" },
};
export function crewRoute(
  store: Store,
  event: DomainEvent,
  definition: PresentationDefinition,
) {
  if (
    definition.terminal?.severity === "critical" ||
    [
      "elite.ship.destroyed",
      "elite.ship.hull.critical",
      "shipos.broadcast.critical",
      "shipos.broadcast.tension",
      "shipos.broadcast.recovery",
    ].includes(event.type)
  )
    return null;
  const note = store.get<{ family: string }>(
    "editorial_notes",
    String(event.payload.editorialNoteId ?? event.id),
  );
  const key =
    event.type === "shipos.editorial.moment"
      ? "editorial:" + note?.family
      : event.type;
  return Object.hasOwn(crewRouting, key) ? crewRouting[key]! : null;
}
export function crewFacts(
  event: DomainEvent,
  definition: PresentationDefinition,
): string[] {
  if (event.type === "elite.ship.fuel.low") {
    const fuel = event.payload.fuelMain;
    return [
      "Seuil d'alerte Elite : réserve < 25 %",
      ...(typeof fuel === "number" && Number.isFinite(fuel) && fuel >= 0
        ? ["Réservoir principal observé : " + fuel.toFixed(1) + " t"]
        : []),
    ];
  }
  // Preserve factual detail and historical context already chosen by ShipOS.
  return (definition.terminal?.lines ?? [definition.title, definition.subtitle])
    .filter(Boolean)
    .slice(0, 3);
}
