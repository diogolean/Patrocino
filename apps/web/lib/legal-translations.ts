// Machine-translated from the English legal copy. Pending legal review.
import { filledCompanyFields, legalConfig } from "@mimelux/core";
import type { LegalDocument, LegalId } from "./legal-documents";

function identity(labels: { legalName: string; cnpj: string; address: string }) {
  const fields = filledCompanyFields();
  const parts = [
    fields.legalName ? `${labels.legalName} ${fields.legalName}` : "",
    fields.cnpj ? `${labels.cnpj} ${fields.cnpj}` : "",
    fields.address ? `${labels.address} ${fields.address}` : "",
  ].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

const company = legalConfig;
const esIdentity = identity({ legalName: "razón social", cnpj: "CNPJ", address: "dirección" });
const deIdentity = identity({ legalName: "Firmenname", cnpj: "CNPJ", address: "Adresse" });
const frIdentity = identity({ legalName: "raison sociale", cnpj: "CNPJ", address: "adresse" });

export const es: Record<LegalId, LegalDocument> = {
  terms: {
    title: "Términos de uso",
    updated: company.termsVersion,
    sections: [
      {
        heading: "Quién ofrece el servicio",
        paragraphs: [
          `${company.productName} lo opera ${company.operatorName}${esIdentity}.`,
          "Al crear una cuenta o usar el sitio, aceptas estos términos y confirmas que tienes 18 años o más.",
        ],
      },
      {
        heading: "La cuenta",
        paragraphs: [
          "La cuenta es personal. Das datos verdaderos y guardas la contraseña. Podemos suspender el acceso si se incumplen estos términos o las normas de contenido.",
          "Las suscripciones se renuevan solas al final de cada periodo, con el mismo medio de pago, hasta que canceles.",
        ],
      },
      {
        heading: "Términos del creador",
        paragraphs: [
          "Quien publica también acepta estos términos de creador. Solo puede aparecer quien haya consentido, y todo el contenido es para adultos.",
          "El creador responde por lo que publica, incluidos los derechos de imagen. La plataforma puede retirar contenido y cerrar la cuenta si se incumplen las normas.",
          "La cuenta de un creador y el chat de esa cuenta pueden operarse con ayuda del equipo del creador y de herramientas de automatización.",
          "La remuneración sigue las reglas de reparto vigentes en la cuenta. Los importes pueden retenerse si hay un reembolso, una disputa o una investigación.",
        ],
      },
      { heading: "Contacto", paragraphs: [`Dudas sobre estos términos: ${company.dpoEmail}.`] },
    ],
  },
  privacy: {
    title: "Política de privacidad",
    updated: company.termsVersion,
    sections: [
      {
        heading: "Responsable",
        paragraphs: [
          `La responsable de los datos personales es ${company.operatorName}${esIdentity}. El contacto de protección de datos (DPO) es ${company.dpoEmail}.`,
          "Esta política sigue la Ley General de Protección de Datos de Brasil (Ley 13.709/2018).",
        ],
      },
      {
        heading: "Datos que recogemos",
        paragraphs: [
          "Recogemos los datos de la cuenta (nombre, correo, contraseña guardada como hash), la fecha y la versión de los términos aceptados, la dirección IP de esa aceptación, datos de uso del sitio e identificadores de cookies.",
          "Los pagos los procesan terceros. Recibimos el identificador del cobro, el importe, la moneda y el estado, no el número completo de la tarjeta.",
        ],
      },
      {
        heading: "Finalidades y bases legales",
        paragraphs: [
          "Usamos los datos para crear y mantener la cuenta, prestar el servicio, cobrar suscripciones, prevenir fraude y cumplir obligaciones legales. Las bases son la ejecución del contrato, la obligación legal, el interés legítimo en la seguridad y, cuando hace falta, el consentimiento.",
          "Aceptar los términos y confirmar la edad guarda el momento, la versión del documento y la IP, para poder demostrar el consentimiento.",
        ],
      },
      {
        heading: "Conservación",
        paragraphs: [
          "Mientras la cuenta existe, guardamos el perfil, los mensajes y las preferencias para prestar el servicio.",
          "Al eliminar la cuenta, el nombre, el correo, la contraseña, la foto, la bio y el texto de los mensajes se borran o se sustituyen en el momento. El perfil público y los medios de quien publica dejan de aparecer.",
          "Los registros de pago, de suscripción y del libro mayor se conservan 5 años, ligados solo a un identificador anónimo, por obligación fiscal y para defender disputas. El plazo corre desde el hecho.",
          "El registro del consentimiento de cookies se conserva 5 años. La cookie de edad dura 12 meses. La sesión de acceso dura 15 minutos y la renovación dura 30 días.",
        ],
      },
      {
        heading: "Derechos de la persona",
        paragraphs: [
          "En Cuenta, Descargar mis datos genera un JSON con perfil, suscripciones, compras, consentimientos y metadatos de mensajes (fecha, conversación y si había medios), sin el texto. La descarga se limita a 3 por hora.",
          "Eliminar mi cuenta pide la contraseña otra vez y la palabra EXCLUIR. La eliminación cancela las suscripciones activas, anonimiza los datos personales y oculta el perfil y los medios públicos de quien publica. Los registros financieros exigidos por la ley permanecen sin el nombre ni el correo.",
          `También puedes escribir a ${company.dpoEmail} y presentar una reclamación ante la autoridad brasileña de protección de datos (ANPD).`,
        ],
      },
      {
        heading: "Cookies",
        paragraphs: [
          "El aviso ofrece Aceptar todas, Solo necesarias y Personalizar. La opción por defecto son solo las cookies estrictamente necesarias: sesión, idioma, confirmación de 18 años y esta preferencia.",
          "Los scripts de analítica y marketing no se cargan antes de esa elección. Aceptar todas, o marcar una opción en Personalizar, activa solo el script correspondiente.",
          `La elección queda en una cookie, en este navegador y, si entraste en la cuenta, también en nuestra base con fecha y hora. La versión actual es ${company.termsVersion}. Una versión nueva vuelve a pedir la elección.`,
          "El enlace Preferencias de cookies del pie de página reabre el aviso.",
        ],
      },
      {
        heading: "Transferencia internacional y pagos",
        paragraphs: [
          "Los procesadores de pago y los proveedores de infraestructura pueden tratar datos fuera de Brasil. Cuando ocurre, exigimos cláusulas contractuales y medidas compatibles con la LGPD.",
          "El procesamiento de tarjeta lo hace el proveedor de pagos configurado en la cuenta. Sigue en modo de prueba mientras no haya una clave de producción activa.",
        ],
      },
    ],
  },
  guidelines: {
    title: "Normas de contenido",
    updated: company.termsVersion,
    sections: [
      {
        heading: "Solo adultos",
        paragraphs: [
          "El sitio es solo para personas de 18 años o más. Está prohibido publicar, pedir o sugerir contenido con menores, aunque sea ficticio.",
        ],
      },
      {
        heading: "Consentimiento",
        paragraphs: [
          "Toda persona identificable en el contenido debe haber consentido la publicación. No se permite contenido hecho sin consentimiento, grabado en secreto u obtenido por amenaza, fraude o intrusión.",
          "También está prohibido el contenido ilegal, de explotación, de odio violento o que infrinja derechos de terceros.",
        ],
      },
      {
        heading: "Denuncia y retirada",
        paragraphs: [
          `Para pedir la retirada de un contenido, escribe a ${company.reportEmail} con la dirección de la página, el motivo y una forma de respuesta.`,
          "Revisamos la solicitud y, cuando la denuncia se confirma, retiramos el contenido y podemos cerrar la cuenta. El contenido que involucre a un menor se retira y puede comunicarse a las autoridades.",
        ],
      },
    ],
  },
  refund: {
    title: "Reembolso y cancelación",
    updated: company.termsVersion,
    sections: [
      {
        heading: "Renovación automática",
        paragraphs: [
          "La suscripción se cobra al inicio del periodo y se renueva sola, por el mismo importe y medio de pago, hasta que canceles.",
        ],
      },
      {
        heading: "Cancela cuando quieras",
        paragraphs: [
          "Puedes cancelar en cualquier momento en Mis suscripciones. La cancelación vale para la próxima renovación. El acceso sigue hasta el final del periodo ya pagado.",
        ],
      },
      {
        heading: "Reembolso",
        paragraphs: [
          "Los cobros ya confirmados no se reembolsan solo porque el periodo no haya terminado, salvo obligación legal, cobro duplicado o fallo demostrado en la entrega del acceso.",
          `Pedidos de reembolso: ${company.dpoEmail}. Los reembolsos aprobados aparecen en el extracto del medio de pago usado.`,
        ],
      },
    ],
  },
};

export const de: Record<LegalId, LegalDocument> = {
  terms: {
    title: "Nutzungsbedingungen",
    updated: company.termsVersion,
    sections: [
      {
        heading: "Wer den Dienst anbietet",
        paragraphs: [
          `${company.productName} wird betrieben von ${company.operatorName}${deIdentity}.`,
          "Mit dem Konto oder der Nutzung der Seite stimmst du diesen Bedingungen zu und bestätigst, dass du 18 Jahre oder älter bist.",
        ],
      },
      {
        heading: "Das Konto",
        paragraphs: [
          "Das Konto ist persönlich. Du gibst richtige Angaben und bewahrst das Passwort. Wir können den Zugang sperren, wenn diese Bedingungen oder die Inhaltsregeln verletzt werden.",
          "Abos verlängern sich am Ende jedes Zeitraums automatisch über dasselbe Zahlungsmittel, bis du kündigst.",
        ],
      },
      {
        heading: "Creator-Bedingungen",
        paragraphs: [
          "Wer veröffentlicht, akzeptiert auch diese Creator-Bedingungen. Sichtbar sein darf nur, wer zugestimmt hat, und alle Inhalte sind für Erwachsene.",
          "Der Creator verantwortet, was veröffentlicht wird, einschließlich Bildrechten. Die Plattform kann Inhalte entfernen und das Konto schließen, wenn die Regeln verletzt werden.",
          "Ein Creator-Konto und der Chat dieses Kontos können mit Hilfe des Creator-Teams und von Automatisierung betrieben werden.",
          "Auszahlungen folgen den Umsatzregeln des Kontos. Beträge können bei Erstattung, Streit oder Untersuchung einbehalten werden.",
        ],
      },
      { heading: "Kontakt", paragraphs: [`Fragen zu diesen Bedingungen: ${company.dpoEmail}.`] },
    ],
  },
  privacy: {
    title: "Datenschutz",
    updated: company.termsVersion,
    sections: [
      {
        heading: "Verantwortliche Stelle",
        paragraphs: [
          `Verantwortlich für personenbezogene Daten ist ${company.operatorName}${deIdentity}. Der Datenschutzkontakt (DPO) ist ${company.dpoEmail}.`,
          "Diese Erklärung folgt dem brasilianischen Datenschutzgesetz (Lei 13.709/2018, LGPD).",
        ],
      },
      {
        heading: "Daten, die wir erheben",
        paragraphs: [
          "Wir erheben Kontodaten (Name, E-Mail, Passwort als Hash), Datum und Version der akzeptierten Bedingungen, die IP-Adresse dieser Annahme, Nutzungsdaten der Seite und Cookie-Kennungen.",
          "Zahlungen verarbeiten Dritte. Wir erhalten die Zahlungs-ID, den Betrag, die Währung und den Status, nicht die volle Kartennummer.",
        ],
      },
      {
        heading: "Zwecke und Rechtsgrundlagen",
        paragraphs: [
          "Wir nutzen die Daten, um das Konto zu führen, den Dienst zu erbringen, Abos abzurechnen, Betrug zu verhindern und gesetzliche Pflichten zu erfüllen. Grundlagen sind Vertrag, gesetzliche Pflicht, berechtigtes Interesse an Sicherheit und, wo nötig, Einwilligung.",
          "Die Annahme der Bedingungen und die Altersbestätigung speichern Zeitpunkt, Dokumentversion und IP, damit die Einwilligung später gezeigt werden kann.",
        ],
      },
      {
        heading: "Speicherung",
        paragraphs: [
          "Solange das Konto besteht, speichern wir Profil, Nachrichten und Einstellungen, um den Dienst zu erbringen.",
          "Bei der Löschung werden Name, E-Mail, Passwort, Foto, Bio und Nachrichtentext sofort gelöscht oder ersetzt. Öffentliches Profil und Medien einer veröffentlichenden Person verschwinden.",
          "Zahlungs-, Abo- und Buchungsdaten bleiben 5 Jahre, nur an eine anonyme ID gebunden, für Steuerpflichten und Zahlungsstreit. Die Frist läuft ab dem Ereignis.",
          "Der Cookie-Einwilligungsnachweis bleibt 5 Jahre. Das Alterscookie gilt 12 Monate. Die Zugriffssitzung dauert 15 Minuten und die Erneuerung 30 Tage.",
        ],
      },
      {
        heading: "Rechte der betroffenen Person",
        paragraphs: [
          "Unter Konto erzeugt Daten herunterladen eine JSON-Datei mit Profil, Abos, Käufen, Einwilligungen und Nachrichtenmetadaten (Zeit, Unterhaltung und ob Medien dabei waren), ohne den Text. Downloads sind auf 3 pro Stunde begrenzt.",
          "Konto löschen verlangt das Passwort erneut und das Wort EXCLUIR. Die Löschung beendet aktive Abos, anonymisiert personenbezogene Daten und verbirgt öffentliches Profil und Medien. Gesetzlich nötige Finanzdaten bleiben, ohne Name und E-Mail.",
          `Du kannst auch an ${company.dpoEmail} schreiben und bei der brasilianischen Datenschutzbehörde (ANPD) Beschwerde einlegen.`,
        ],
      },
      {
        heading: "Cookies",
        paragraphs: [
          "Der Hinweis bietet Alle akzeptieren, Nur notwendige und Anpassen. Standard sind nur unbedingt nötige Cookies: Sitzung, Sprache, die 18+-Bestätigung und diese Auswahl.",
          "Analyse- und Marketing-Skripte laden nicht vor dieser Wahl. Alle akzeptieren oder eine Option unter Anpassen lädt nur das passende Skript.",
          `Die Wahl liegt in einem Cookie, in diesem Browser und, wenn du angemeldet bist, auch in unserer Datenbank mit Datum und Uhrzeit. Die aktuelle Version ist ${company.termsVersion}. Eine neue Version fragt erneut.`,
          "Der Fußzeilenlink Cookie-Einstellungen öffnet den Hinweis wieder.",
        ],
      },
      {
        heading: "Internationale Übermittlung und Zahlungen",
        paragraphs: [
          "Zahlungsdienstleister und Infrastruktur können Daten außerhalb Brasiliens verarbeiten. Dann verlangen wir Vertragsklauseln und Schutzmaßnahmen, die mit der LGPD vereinbar sind.",
          "Kartenverarbeitung macht der auf dem Konto eingestellte Zahlungsanbieter. Sie bleibt im Testmodus, solange kein Live-Schlüssel aktiv ist.",
        ],
      },
    ],
  },
  guidelines: {
    title: "Inhaltsregeln",
    updated: company.termsVersion,
    sections: [
      {
        heading: "Nur Erwachsene",
        paragraphs: [
          "Die Seite ist nur für Personen ab 18 Jahren. Inhalte mit Minderjährigen zu veröffentlichen, zu verlangen oder nahezulegen ist verboten, auch als Fiktion.",
        ],
      },
      {
        heading: "Einwilligung",
        paragraphs: [
          "Jede erkennbare Person im Inhalt muss der Veröffentlichung zugestimmt haben. Inhalte ohne Einwilligung, heimlich aufgenommen oder durch Drohung, Betrug oder Eindringen erlangt, sind nicht erlaubt.",
          "Illegale Inhalte, Ausbeutung, gewalttätiger Hass und Material, das Rechte anderer verletzt, sind ebenfalls verboten.",
        ],
      },
      {
        heading: "Meldung und Entfernung",
        paragraphs: [
          `Für eine Entfernung schreib an ${company.reportEmail} mit der Seitenadresse, dem Grund und einer Antwortmöglichkeit.`,
          "Wir prüfen die Anfrage und entfernen den Inhalt, wenn die Meldung stimmt. Das Konto kann geschlossen werden. Inhalte mit Minderjährigen werden entfernt und können den Behörden gemeldet werden.",
        ],
      },
    ],
  },
  refund: {
    title: "Erstattung und Kündigung",
    updated: company.termsVersion,
    sections: [
      {
        heading: "Automatische Verlängerung",
        paragraphs: [
          "Ein Abo wird zu Beginn des Zeitraums berechnet und verlängert sich von selbst, zum selben Preis und Zahlungsmittel, bis du kündigst.",
        ],
      },
      {
        heading: "Jederzeit kündigen",
        paragraphs: [
          "Du kannst jederzeit unter Meine Abos kündigen. Die Kündigung gilt für die nächste Verlängerung. Der Zugang bleibt bis zum Ende des schon bezahlten Zeitraums.",
        ],
      },
      {
        heading: "Erstattung",
        paragraphs: [
          "Bestätigte Zahlungen werden nicht nur deshalb erstattet, weil der Zeitraum noch läuft, außer das Gesetz verlangt es, die Zahlung war doppelt oder der Zugang ist nachweislich ausgefallen.",
          `Erstattungsanfragen: ${company.dpoEmail}. Genehmigte Erstattungen erscheinen auf dem Kontoauszug des genutzten Zahlungsmittels.`,
        ],
      },
    ],
  },
};

export const fr: Record<LegalId, LegalDocument> = {
  terms: {
    title: "Conditions d'utilisation",
    updated: company.termsVersion,
    sections: [
      {
        heading: "Qui propose le service",
        paragraphs: [
          `${company.productName} est exploité par ${company.operatorName}${frIdentity}.`,
          "En créant un compte ou en utilisant le site, vous acceptez ces conditions et confirmez avoir 18 ans ou plus.",
        ],
      },
      {
        heading: "Le compte",
        paragraphs: [
          "Le compte est personnel. Vous donnez des informations exactes et gardez le mot de passe. Nous pouvons suspendre l'accès si ces conditions ou les règles de contenu sont enfreintes.",
          "Les abonnements se renouvellent automatiquement à la fin de chaque période, avec le même moyen de paiement, jusqu'à l'annulation.",
        ],
      },
      {
        heading: "Conditions du créateur",
        paragraphs: [
          "Toute personne qui publie accepte aussi ces conditions. Seules les personnes qui ont consenti peuvent apparaître, et tout le contenu s'adresse aux adultes.",
          "Le créateur est responsable de ce qu'il publie, y compris les droits à l'image. La plateforme peut retirer un contenu et fermer le compte si les règles ne sont pas respectées.",
          "Le compte d'un créateur et le chat de ce compte peuvent être opérés avec l'aide de son équipe et d'outils d'automatisation.",
          "La rémunération suit les règles de reversement du compte. Les sommes peuvent être retenues en cas de remboursement, de litige ou d'enquête.",
        ],
      },
      { heading: "Contact", paragraphs: [`Questions sur ces conditions : ${company.dpoEmail}.`] },
    ],
  },
  privacy: {
    title: "Politique de confidentialité",
    updated: company.termsVersion,
    sections: [
      {
        heading: "Responsable",
        paragraphs: [
          `Le responsable des données personnelles est ${company.operatorName}${frIdentity}. Le contact protection des données (DPO) est ${company.dpoEmail}.`,
          "Cette politique suit la loi brésilienne de protection des données (loi 13.709/2018, LGPD).",
        ],
      },
      {
        heading: "Données collectées",
        paragraphs: [
          "Nous collectons les données du compte (nom, e-mail, mot de passe stocké sous forme de hash), la date et la version des conditions acceptées, l'adresse IP de cette acceptation, des données d'usage du site et des identifiants de cookies.",
          "Les paiements sont traités par des tiers. Nous recevons l'identifiant du paiement, le montant, la devise et le statut, pas le numéro complet de la carte.",
        ],
      },
      {
        heading: "Finalités et bases légales",
        paragraphs: [
          "Nous utilisons les données pour créer et tenir le compte, fournir le service, facturer les abonnements, prévenir la fraude et respecter les obligations légales. Les bases sont l'exécution du contrat, l'obligation légale, l'intérêt légitime de sécurité et, quand il est requis, le consentement.",
          "Accepter les conditions et confirmer l'âge enregistre le moment, la version du document et l'adresse IP, afin de pouvoir montrer le consentement.",
        ],
      },
      {
        heading: "Conservation",
        paragraphs: [
          "Tant que le compte existe, nous gardons le profil, les messages et les préférences pour fournir le service.",
          "À la suppression, le nom, l'e-mail, le mot de passe, la photo, la bio et le texte des messages sont effacés ou remplacés immédiatement. Le profil public et les médias de la personne qui publie disparaissent.",
          "Les enregistrements de paiement, d'abonnement et du grand livre sont conservés 5 ans, liés seulement à un identifiant anonyme, pour les obligations fiscales et les litiges. Le délai court à partir du fait.",
          "La preuve du consentement cookies est conservée 5 ans. Le cookie d'âge dure 12 mois. La session d'accès dure 15 minutes et le renouvellement 30 jours.",
        ],
      },
      {
        heading: "Droits de la personne",
        paragraphs: [
          "Dans Compte, Télécharger mes données produit un JSON avec le profil, les abonnements, les achats, les consentements et les métadonnées des messages (date, conversation et présence de média), sans le texte. Le téléchargement est limité à 3 par heure.",
          "Supprimer mon compte redemande le mot de passe et le mot EXCLUIR. La suppression annule les abonnements actifs, anonymise les données personnelles et masque le profil public et les médias. Les enregistrements financiers exigés par la loi restent, sans le nom ni l'e-mail.",
          `Vous pouvez aussi écrire à ${company.dpoEmail} et déposer une plainte auprès de l'autorité brésilienne de protection des données (ANPD).`,
        ],
      },
      {
        heading: "Cookies",
        paragraphs: [
          "La bannière propose Tout accepter, Nécessaires seulement et Personnaliser. Par défaut, seuls les cookies strictement nécessaires restent : session, langue, confirmation des 18 ans et ce choix.",
          "Les scripts d'analyse et de marketing ne se chargent pas avant ce choix. Tout accepter, ou une option cochée dans Personnaliser, n'active que le script correspondant.",
          `Le choix est stocké dans un cookie, dans ce navigateur et, si vous êtes connecté, dans notre base avec la date et l'heure. La version actuelle est ${company.termsVersion}. Une nouvelle version redemande le choix.`,
          "Le lien Préférences de cookies du pied de page rouvre la bannière.",
        ],
      },
      {
        heading: "Transfert international et paiements",
        paragraphs: [
          "Les prestataires de paiement et d'infrastructure peuvent traiter des données hors du Brésil. Dans ce cas, nous exigeons des clauses contractuelles et des garanties compatibles avec la LGPD.",
          "Le traitement de carte est fait par le prestataire configuré sur le compte. Il reste en mode test tant qu'aucune clé de production n'est active.",
        ],
      },
    ],
  },
  guidelines: {
    title: "Règles de contenu",
    updated: company.termsVersion,
    sections: [
      {
        heading: "Adultes seulement",
        paragraphs: [
          "Le site est réservé aux personnes de 18 ans ou plus. Publier, demander ou suggérer un contenu impliquant un mineur est interdit, y compris une représentation fictive.",
        ],
      },
      {
        heading: "Consentement",
        paragraphs: [
          "Toute personne identifiable dans le contenu doit avoir consenti à la publication. Un contenu fait sans consentement, enregistré en secret ou obtenu par menace, fraude ou intrusion n'est pas permis.",
          "Les contenus illégaux, l'exploitation, la haine violente et les contenus qui portent atteinte aux droits d'autrui sont aussi interdits.",
        ],
      },
      {
        heading: "Signalement et retrait",
        paragraphs: [
          `Pour demander un retrait, écrivez à ${company.reportEmail} avec l'adresse de la page, le motif et un moyen de réponse.`,
          "Nous examinons la demande et, si le signalement est confirmé, retirons le contenu et pouvons fermer le compte. Un contenu impliquant un mineur est retiré et peut être signalé aux autorités.",
        ],
      },
    ],
  },
  refund: {
    title: "Remboursement et annulation",
    updated: company.termsVersion,
    sections: [
      {
        heading: "Renouvellement automatique",
        paragraphs: [
          "L'abonnement est facturé au début de la période et se renouvelle seul, au même prix et avec le même moyen de paiement, jusqu'à l'annulation.",
        ],
      },
      {
        heading: "Annuler à tout moment",
        paragraphs: [
          "Vous pouvez annuler à tout moment dans Mes abonnements. L'annulation s'applique au prochain renouvellement. L'accès reste jusqu'à la fin de la période déjà payée.",
        ],
      },
      {
        heading: "Remboursement",
        paragraphs: [
          "Les paiements confirmés ne sont pas remboursés seulement parce que la période n'est pas finie, sauf obligation légale, paiement en double ou échec avéré de l'accès.",
          `Demandes de remboursement : ${company.dpoEmail}. Les remboursements acceptés apparaissent sur le relevé du moyen de paiement utilisé.`,
        ],
      },
    ],
  },
};
