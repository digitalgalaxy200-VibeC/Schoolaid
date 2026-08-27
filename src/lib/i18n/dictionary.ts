export type Locale = "en" | "fr";

export const LOCALES: Locale[] = ["en", "fr"];

interface TitledItem {
  title: string;
  description: string;
}

interface FAQItem {
  q: string;
  a: string;
}

export interface Dictionary {
  nav: {
    solutions: string;
    process: string;
    faq: string;
    cta: string;
    openMenu: string;
    closeMenu: string;
  };
  hero: {
    eyebrow: string;
    headlineLine1: string;
    headlineLine2: string;
    subhead: string;
    paragraph1: string;
    paragraph2: string;
    ctaPrimary: string;
    ctaSecondary: string;
    trustLine: string;
    imageAlt: string;
  };
  challenge: {
    eyebrow: string;
    heading: string;
    intro: string;
    outro: string;
    pains: string[];
  };
  position: {
    eyebrow: string;
    heading: string;
    paragraph1: string;
    paragraph2: string;
    paragraph3: string;
  };
  transform: {
    eyebrow: string;
    heading: string;
    areas: TitledItem[];
  };
  whyItMatters: {
    eyebrow: string;
    heading: string;
    paragraph: string;
    outcomes: string[];
  };
  vision: {
    eyebrow: string;
    heading: string;
    paragraph1: string;
    paragraph2: string;
    recordLines: string[];
    paragraph3: string;
    closingLine: string;
    preservedLabel: string;
  };
  whyPartner: {
    eyebrow: string;
    heading: string;
    paragraph1: string;
    paragraph2: string;
    imageAlt: string;
  };
  whoShouldApply: {
    eyebrow: string;
    heading: string;
    intro: string;
    traits: string[];
    imageAlt: string;
  };
  process: {
    eyebrow: string;
    heading: string;
    steps: TitledItem[];
  };
  faq: {
    eyebrow: string;
    heading: string;
    items: FAQItem[];
  };
  finalCta: {
    heading: string;
    paragraph: string;
    ctaPrimary: string;
    ctaSecondary: string;
    footnote: string;
    imageAlt: string;
  };
  footer: {
    tagline: string;
    blurb: string;
    solutionsHeading: string;
    solutions: string[];
    resourcesHeading: string;
    resources: string[];
    contactHeading: string;
    privacyPolicy: string;
    termsOfService: string;
    copyright: string;
  };
  waitlistForm: {
    modalTitle: string;
    intro: string;
    fullName: string;
    fullNamePlaceholder: string;
    schoolName: string;
    schoolNamePlaceholder: string;
    email: string;
    emailPlaceholder: string;
    phone: string;
    phonePlaceholder: string;
    country: string;
    countryPlaceholder: string;
    city: string;
    cityPlaceholder: string;
    message: string;
    messagePlaceholder: string;
    submit: string;
    successHeading: string;
    successBody: string;
    successFallbackName: string;
    doneButton: string;
    errorGeneric: string;
    errorRateLimit: string;
    validationRequired: string;
    validationEmail: string;
  };
}

const en: Dictionary = {
  nav: {
    solutions: "Solutions",
    process: "Process",
    faq: "FAQ",
    cta: "Start Your Transformation",
    openMenu: "Open menu",
    closeMenu: "Close menu",
  },
  hero: {
    eyebrow: "Digital Transformation Partner",
    headlineLine1: "Digital transformation",
    headlineLine2: "for African schools.",
    subhead: "Helping African schools build smarter, more connected operations.",
    paragraph1:
      "From admissions to graduation, SchoolAid replaces paper-based administration, disconnected spreadsheets, and manual processes with connected digital operations that improve efficiency, strengthen communication, and preserve every student’s educational journey.",
    paragraph2:
      "SchoolAid is not just another school management system. We partner with schools to understand how they operate, redesign critical workflows, implement practical digital solutions, and support them throughout their digital transformation journey.",
    ctaPrimary: "Start Your School’s Digital Transformation",
    ctaSecondary: "Book a Discovery Call",
    trustLine: "Trusted by schools committed to building the future of education.",
    imageAlt: "Students writing at their desks in a classroom",
  },
  challenge: {
    eyebrow: "The Challenge",
    heading: "Every school wants to grow. Growth shouldn’t create more administrative work.",
    intro:
      "Many schools are doing remarkable work in education while still relying on manual processes behind the scenes.",
    outro:
      "As schools grow, these challenges become even more difficult to manage. Digital transformation helps schools build better systems that support sustainable growth.",
    pains: [
      "Admissions are managed on paper.",
      "Student records are spread across multiple files.",
      "Teachers spend hours preparing report cards.",
      "Finance teams work with disconnected spreadsheets.",
      "Parents struggle to access timely information.",
      "Important academic records become difficult to preserve.",
    ],
  },
  position: {
    eyebrow: "Our Position",
    heading: "SchoolAid is Africa’s digital transformation partner for schools.",
    paragraph1:
      "We believe digital transformation is not about installing software. It is about helping schools redesign the way they operate. Every school is different.",
    paragraph2:
      "Instead of forcing schools to adapt to technology, SchoolAid works alongside school leaders to understand existing processes, identify opportunities for improvement, and implement digital systems that make everyday school management simpler, faster, and more connected.",
    paragraph3:
      "Our goal is simple. Help schools spend less time managing administration and more time delivering quality education.",
  },
  transform: {
    eyebrow: "What We Help Schools Transform",
    heading: "Building better schools through digital transformation.",
    areas: [
      {
        title: "Student Administration",
        description:
          "Create a connected student journey from admission to graduation with secure digital records, admissions management, promotions, transfers, and lifelong student history.",
      },
      {
        title: "Academic Management",
        description:
          "Simplify assessments, examinations, grading, report cards, academic tracking, and curriculum management while reducing administrative workload for teachers.",
      },
      {
        title: "School Operations",
        description:
          "Digitize attendance, communication, scheduling, approvals, document management, and everyday administrative processes.",
      },
      {
        title: "Financial Administration",
        description:
          "Improve fee management, payment tracking, receipts, reporting, and financial visibility across the entire school.",
      },
      {
        title: "Parent & Student Experience",
        description:
          "Strengthen communication through secure parent and student portals, academic progress tracking, notifications, and digital report cards.",
      },
      {
        title: "School Website & Digital Presence",
        description:
          "Build a stronger digital identity with professional school websites, online admissions, branding, and communication tools.",
      },
    ],
  },
  whyItMatters: {
    eyebrow: "Why It Matters",
    heading: "Better systems. Better decisions. Better schools.",
    paragraph:
      "Digital transformation allows schools to operate with greater confidence. Instead of spending valuable time searching for information, preparing reports manually, or managing disconnected records, school leaders gain better visibility into daily operations.",
    outcomes: [
      "Teachers spend more time teaching.",
      "Parents stay informed.",
      "Students receive a better educational experience.",
      "School leaders make better decisions using accurate information.",
    ],
  },
  vision: {
    eyebrow: "Our Vision",
    heading: "Preserving every student’s educational journey.",
    paragraph1:
      "A student’s educational journey should never disappear after graduation. SchoolAid is building a future where every student’s academic history remains securely preserved and accessible throughout their lifetime.",
    paragraph2:
      "Instead of losing report cards or searching through old filing cabinets, students will always have access to:",
    recordLines: [
      "Their report cards.",
      "Their academic achievements.",
      "Their progress.",
      "Their learning history.",
      "Their educational story.",
    ],
    paragraph3:
      "In the future, these verified academic records can support school transfers, university admissions, scholarship applications, employment verification, and lifelong learning opportunities.",
    closingLine: "Because education is a lifelong journey. Their records should be too.",
    preservedLabel: "Preserved",
  },
  whyPartner: {
    eyebrow: "Why Partner With SchoolAid",
    heading: "More than software. A long-term digital transformation partner.",
    paragraph1:
      "Schools don’t need another software vendor. They need a trusted partner that understands education, improves operational processes, supports technology adoption, and helps build sustainable systems for long-term growth.",
    paragraph2:
      "SchoolAid combines technology, implementation, training, and ongoing support to help schools successfully embrace digital transformation.",
    imageAlt: "SchoolAid team members meeting with a school partner",
  },
  whoShouldApply: {
    eyebrow: "Who Should Apply",
    heading: "We’re looking for schools that…",
    intro:
      "This partnership is designed for schools that are ready to improve the way they operate. Your school is a great fit if you:",
    traits: [
      "Still rely heavily on paper records.",
      "Use spreadsheets to manage important school information.",
      "Spend significant time preparing reports manually.",
      "Want to improve communication with parents.",
      "Are planning to modernize school operations.",
      "Want a professional school website.",
      "Want to preserve student records securely.",
      "Are looking for a long-term digital transformation partner.",
    ],
    imageAlt: "A teacher smiling in front of a classroom whiteboard",
  },
  process: {
    eyebrow: "Our Digital Transformation Process",
    heading: "Every partnership begins with understanding your school.",
    steps: [
      {
        title: "Digital Transformation Assessment",
        description: "We learn about your school, your current operations, your challenges, and your goals.",
      },
      {
        title: "Discovery Session",
        description: "We review your assessment and identify opportunities to improve your school’s operations.",
      },
      {
        title: "Digital Transformation Roadmap",
        description: "We recommend a practical implementation plan tailored specifically to your school.",
      },
      {
        title: "Implementation",
        description: "We deploy the right digital solutions based on your school’s needs.",
      },
      {
        title: "Training & Adoption",
        description: "We train your administrators, teachers, and staff to ensure successful adoption.",
      },
      {
        title: "Continuous Partnership",
        description: "As your school grows, SchoolAid continues supporting your digital transformation journey.",
      },
    ],
  },
  faq: {
    eyebrow: "Frequently Asked Questions",
    heading: "Common questions from school leaders.",
    items: [
      {
        q: "Is SchoolAid a school management system?",
        a: "SchoolAid is a Digital Transformation Partner that helps schools redesign and modernize the way they operate through technology, implementation, training, and continuous support.",
      },
      {
        q: "Can SchoolAid help us migrate from paper or Excel?",
        a: "Yes. Helping schools transition from manual processes to connected digital operations is one of our core strengths.",
      },
      {
        q: "Can SchoolAid build our school website?",
        a: "Yes. Schools may request website design, online admissions, branding, and digital communication services as part of their digital transformation journey.",
      },
      {
        q: "Do we receive training?",
        a: "Absolutely. Every partnership includes implementation guidance, onboarding, and training to help your team successfully adopt the new systems.",
      },
    ],
  },
  finalCta: {
    heading: "Ready to begin your school’s digital transformation?",
    paragraph:
      "Join a growing community of schools committed to building smarter operations, stronger communication, better educational experiences, and a future where every student’s educational journey is securely preserved.",
    ctaPrimary: "Start Your School’s Digital Transformation",
    ctaSecondary: "Book a Discovery Call",
    footnote: "Takes less than a minute · no obligation",
    imageAlt: "A student smiling, holding a book and a phone",
  },
  footer: {
    tagline: "Africa’s Digital Transformation Partner for Schools.",
    blurb:
      "Helping schools modernize their operations, empower educators, strengthen school communities, and preserve every student’s educational journey for generations to come.",
    solutionsHeading: "Solutions",
    solutions: [
      "Digital Transformation",
      "Student Administration",
      "Academic Management",
      "Financial Administration",
      "School Websites",
      "Parent & Student Experience",
    ],
    resourcesHeading: "Resources",
    resources: ["Blog", "Case Studies", "Digital Transformation Guide", "Frequently Asked Questions"],
    contactHeading: "Contact",
    privacyPolicy: "Privacy Policy",
    termsOfService: "Terms of Service",
    copyright: "© {year} SchoolAid. All rights reserved.",
  },
  waitlistForm: {
    modalTitle: "Start Your School’s Digital Transformation",
    intro: "Tell us a bit about your school and we’ll be in touch.",
    fullName: "Full name",
    fullNamePlaceholder: "Amara Okafor",
    schoolName: "School / organization",
    schoolNamePlaceholder: "Ridgeview Academy",
    email: "Email",
    emailPlaceholder: "you@school.com",
    phone: "Phone",
    phonePlaceholder: "+234 801 234 5678",
    country: "Country",
    countryPlaceholder: "Nigeria",
    city: "City",
    cityPlaceholder: "Lagos",
    message: "What would you like help with?",
    messagePlaceholder: "Tell us about your current setup and what you're hoping to improve.",
    submit: "Submit",
    successHeading: "Thanks — we’ve got it.",
    successBody: "A member of the SchoolAid team will reach out to {email} shortly to schedule your discovery call.",
    successFallbackName: "you",
    doneButton: "Done",
    errorGeneric: "Something went wrong. Please try again.",
    errorRateLimit: "Too many submissions. Please try again later.",
    validationRequired: "This field is required.",
    validationEmail: "Enter a valid email address.",
  },
};

const fr: Dictionary = {
  nav: {
    solutions: "Solutions",
    process: "Processus",
    faq: "FAQ",
    cta: "Démarrer la transformation",
    openMenu: "Ouvrir le menu",
    closeMenu: "Fermer le menu",
  },
  hero: {
    eyebrow: "Partenaire de transformation numérique",
    headlineLine1: "La transformation numérique",
    headlineLine2: "des écoles africaines.",
    subhead:
      "Nous aidons les écoles africaines à bâtir des opérations plus intelligentes et mieux connectées.",
    paragraph1:
      "De l’admission à l’obtention du diplôme, SchoolAid remplace l’administration papier, les tableurs déconnectés et les processus manuels par des opérations numériques connectées qui améliorent l’efficacité, renforcent la communication et préservent le parcours scolaire de chaque élève.",
    paragraph2:
      "SchoolAid n’est pas un simple système de gestion scolaire de plus. Nous nous associons aux écoles pour comprendre leur fonctionnement, repenser leurs processus essentiels, mettre en place des solutions numériques concrètes et les accompagner tout au long de leur transformation numérique.",
    ctaPrimary: "Démarrez la transformation numérique de votre école",
    ctaSecondary: "Réserver un appel découverte",
    trustLine: "Adopté par des écoles engagées à construire l’avenir de l’éducation.",
    imageAlt: "Des élèves écrivant à leur bureau dans une salle de classe",
  },
  challenge: {
    eyebrow: "Le Défi",
    heading:
      "Chaque école veut grandir. Cette croissance ne devrait pas générer plus de travail administratif.",
    intro:
      "De nombreuses écoles accomplissent un travail remarquable en matière d’éducation tout en s’appuyant encore sur des processus manuels en coulisses.",
    outro:
      "À mesure que les écoles grandissent, ces défis deviennent encore plus difficiles à gérer. La transformation numérique aide les écoles à mettre en place de meilleurs systèmes qui soutiennent une croissance durable.",
    pains: [
      "Les admissions sont gérées sur papier.",
      "Les dossiers des élèves sont dispersés dans plusieurs fichiers.",
      "Les enseignants passent des heures à préparer les bulletins.",
      "Les équipes financières travaillent avec des tableurs déconnectés.",
      "Les parents peinent à accéder à l’information en temps voulu.",
      "Les dossiers académiques importants deviennent difficiles à conserver.",
    ],
  },
  position: {
    eyebrow: "Notre Positionnement",
    heading: "SchoolAid est le partenaire de transformation numérique des écoles en Afrique.",
    paragraph1:
      "Nous pensons que la transformation numérique ne consiste pas à installer un logiciel. Il s’agit d’aider les écoles à repenser leur fonctionnement. Chaque école est différente.",
    paragraph2:
      "Plutôt que de forcer les écoles à s’adapter à la technologie, SchoolAid travaille aux côtés des dirigeants d’établissements pour comprendre les processus existants, identifier des pistes d’amélioration et mettre en place des systèmes numériques qui rendent la gestion scolaire quotidienne plus simple, plus rapide et mieux connectée.",
    paragraph3:
      "Notre objectif est simple : aider les écoles à consacrer moins de temps à l’administration et plus de temps à offrir un enseignement de qualité.",
  },
  transform: {
    eyebrow: "Ce Que Nous Aidons Les Écoles À Transformer",
    heading: "Construire de meilleures écoles grâce à la transformation numérique.",
    areas: [
      {
        title: "Administration des élèves",
        description:
          "Créez un parcours élève connecté, de l’admission à l’obtention du diplôme, grâce à des dossiers numériques sécurisés, la gestion des admissions, des passages de classe, des transferts et un historique scolaire complet.",
      },
      {
        title: "Gestion académique",
        description:
          "Simplifiez les évaluations, examens, notations, bulletins, suivi académique et gestion des programmes, tout en réduisant la charge administrative des enseignants.",
      },
      {
        title: "Opérations scolaires",
        description:
          "Numérisez la présence, la communication, les emplois du temps, les validations, la gestion documentaire et les processus administratifs quotidiens.",
      },
      {
        title: "Administration financière",
        description:
          "Améliorez la gestion des frais de scolarité, le suivi des paiements, les reçus, les rapports et la visibilité financière de l’ensemble de l’école.",
      },
      {
        title: "Expérience parents et élèves",
        description:
          "Renforcez la communication grâce à des portails sécurisés pour les parents et les élèves, au suivi des progrès académiques, aux notifications et aux bulletins numériques.",
      },
      {
        title: "Site web et présence numérique",
        description:
          "Développez une identité numérique forte grâce à des sites web scolaires professionnels, des admissions en ligne, une image de marque et des outils de communication.",
      },
    ],
  },
  whyItMatters: {
    eyebrow: "Pourquoi C’est Important",
    heading: "De meilleurs systèmes. De meilleures décisions. De meilleures écoles.",
    paragraph:
      "La transformation numérique permet aux écoles de fonctionner avec plus d’assurance. Plutôt que de passer un temps précieux à rechercher des informations, préparer des rapports manuellement ou gérer des dossiers dispersés, les dirigeants d’établissements bénéficient d’une meilleure visibilité sur les opérations quotidiennes.",
    outcomes: [
      "Les enseignants consacrent plus de temps à enseigner.",
      "Les parents restent informés.",
      "Les élèves bénéficient d’une meilleure expérience éducative.",
      "Les dirigeants d’établissements prennent de meilleures décisions grâce à des informations fiables.",
    ],
  },
  vision: {
    eyebrow: "Notre Vision",
    heading: "Préserver le parcours scolaire de chaque élève.",
    paragraph1:
      "Le parcours scolaire d’un élève ne devrait jamais disparaître après l’obtention de son diplôme. SchoolAid construit un avenir où l’historique académique de chaque élève reste préservé en toute sécurité et accessible tout au long de sa vie.",
    paragraph2:
      "Plutôt que de perdre des bulletins ou de fouiller de vieux classeurs, les élèves auront toujours accès à :",
    recordLines: [
      "Leurs bulletins.",
      "Leurs réussites académiques.",
      "Leur progression.",
      "Leur historique d’apprentissage.",
      "Leur parcours scolaire.",
    ],
    paragraph3:
      "À l’avenir, ces dossiers académiques vérifiés pourront faciliter les transferts d’école, les admissions universitaires, les demandes de bourses, les vérifications d’emploi et les opportunités de formation tout au long de la vie.",
    closingLine:
      "Parce que l’éducation est un parcours qui dure toute une vie. Leurs dossiers devraient l’être aussi.",
    preservedLabel: "Préservé",
  },
  whyPartner: {
    eyebrow: "Pourquoi S’associer À SchoolAid",
    heading: "Plus qu’un logiciel. Un partenaire de transformation numérique sur le long terme.",
    paragraph1:
      "Les écoles n’ont pas besoin d’un énième fournisseur de logiciels. Elles ont besoin d’un partenaire de confiance qui comprend l’éducation, améliore les processus opérationnels, accompagne l’adoption technologique et aide à bâtir des systèmes durables pour une croissance à long terme.",
    paragraph2:
      "SchoolAid combine technologie, mise en œuvre, formation et accompagnement continu pour aider les écoles à réussir leur transformation numérique.",
    imageAlt: "Des membres de l’équipe SchoolAid en réunion avec une école partenaire",
  },
  whoShouldApply: {
    eyebrow: "Qui Peut Postuler",
    heading: "Nous recherchons des écoles qui…",
    intro:
      "Ce partenariat est conçu pour les écoles prêtes à améliorer leur fonctionnement. Votre école est faite pour nous si vous :",
    traits: [
      "Dépendez encore fortement des dossiers papier.",
      "Utilisez des tableurs pour gérer des informations scolaires importantes.",
      "Passez beaucoup de temps à préparer des rapports manuellement.",
      "Souhaitez améliorer la communication avec les parents.",
      "Prévoyez de moderniser les opérations de l’école.",
      "Souhaitez un site web scolaire professionnel.",
      "Souhaitez préserver les dossiers des élèves en toute sécurité.",
      "Recherchez un partenaire de transformation numérique sur le long terme.",
    ],
    imageAlt: "Une enseignante souriante devant un tableau de classe",
  },
  process: {
    eyebrow: "Notre Processus de Transformation Numérique",
    heading: "Chaque partenariat commence par la compréhension de votre école.",
    steps: [
      {
        title: "Évaluation de la transformation numérique",
        description: "Nous découvrons votre école, vos opérations actuelles, vos défis et vos objectifs.",
      },
      {
        title: "Session de découverte",
        description:
          "Nous examinons votre évaluation et identifions les opportunités d’amélioration des opérations de votre école.",
      },
      {
        title: "Feuille de route de transformation numérique",
        description:
          "Nous recommandons un plan de mise en œuvre concret, conçu spécifiquement pour votre école.",
      },
      {
        title: "Mise en œuvre",
        description: "Nous déployons les solutions numériques adaptées aux besoins de votre école.",
      },
      {
        title: "Formation et adoption",
        description:
          "Nous formons vos administrateurs, enseignants et personnel pour garantir une adoption réussie.",
      },
      {
        title: "Partenariat continu",
        description:
          "À mesure que votre école grandit, SchoolAid continue de vous accompagner dans votre transformation numérique.",
      },
    ],
  },
  faq: {
    eyebrow: "Questions Fréquentes",
    heading: "Questions courantes des dirigeants d’établissements.",
    items: [
      {
        q: "SchoolAid est-il un système de gestion scolaire ?",
        a: "SchoolAid est un partenaire de transformation numérique qui aide les écoles à repenser et moderniser leur fonctionnement grâce à la technologie, la mise en œuvre, la formation et un accompagnement continu.",
      },
      {
        q: "SchoolAid peut-il nous aider à migrer depuis le papier ou Excel ?",
        a: "Oui. Aider les écoles à passer de processus manuels à des opérations numériques connectées est l’une de nos principales expertises.",
      },
      {
        q: "SchoolAid peut-il créer le site web de notre école ?",
        a: "Oui. Les écoles peuvent demander la conception de leur site web, la gestion des admissions en ligne, leur image de marque et des services de communication numérique dans le cadre de leur transformation numérique.",
      },
      {
        q: "Bénéficions-nous d’une formation ?",
        a: "Absolument. Chaque partenariat comprend un accompagnement à la mise en œuvre, une intégration et une formation pour aider votre équipe à adopter avec succès les nouveaux systèmes.",
      },
    ],
  },
  finalCta: {
    heading: "Prêt à démarrer la transformation numérique de votre école ?",
    paragraph:
      "Rejoignez une communauté grandissante d’écoles engagées à bâtir des opérations plus intelligentes, une communication plus forte, de meilleures expériences éducatives, et un avenir où le parcours scolaire de chaque élève est préservé en toute sécurité.",
    ctaPrimary: "Démarrez la transformation numérique de votre école",
    ctaSecondary: "Réserver un appel découverte",
    footnote: "Moins d’une minute · sans engagement",
    imageAlt: "Une élève souriante, tenant un livre et un téléphone",
  },
  footer: {
    tagline: "Le partenaire de transformation numérique des écoles en Afrique.",
    blurb:
      "Nous aidons les écoles à moderniser leurs opérations, à renforcer les enseignants, à consolider les communautés scolaires et à préserver le parcours scolaire de chaque élève pour les générations à venir.",
    solutionsHeading: "Solutions",
    solutions: [
      "Transformation numérique",
      "Administration des élèves",
      "Gestion académique",
      "Administration financière",
      "Sites web scolaires",
      "Expérience parents et élèves",
    ],
    resourcesHeading: "Ressources",
    resources: ["Blog", "Études de cas", "Guide de transformation numérique", "Questions fréquentes"],
    contactHeading: "Contact",
    privacyPolicy: "Politique de confidentialité",
    termsOfService: "Conditions d’utilisation",
    copyright: "© {year} SchoolAid. Tous droits réservés.",
  },
  waitlistForm: {
    modalTitle: "Démarrez la transformation numérique de votre école",
    intro: "Parlez-nous un peu de votre école, nous vous recontacterons rapidement.",
    fullName: "Nom complet",
    fullNamePlaceholder: "Amara Okafor",
    schoolName: "École / organisation",
    schoolNamePlaceholder: "Ridgeview Academy",
    email: "E-mail",
    emailPlaceholder: "vous@ecole.com",
    phone: "Téléphone",
    phonePlaceholder: "+234 801 234 5678",
    country: "Pays",
    countryPlaceholder: "Nigeria",
    city: "Ville",
    cityPlaceholder: "Lagos",
    message: "Avec quoi souhaitez-vous être accompagné ?",
    messagePlaceholder: "Parlez-nous de votre organisation actuelle et de ce que vous espérez améliorer.",
    submit: "Envoyer",
    successHeading: "Merci, nous avons bien reçu votre demande.",
    successBody: "Un membre de l’équipe SchoolAid contactera {email} prochainement pour planifier votre appel découverte.",
    successFallbackName: "vous",
    doneButton: "Terminé",
    errorGeneric: "Une erreur s’est produite. Veuillez réessayer.",
    errorRateLimit: "Trop de soumissions. Veuillez réessayer plus tard.",
    validationRequired: "Ce champ est requis.",
    validationEmail: "Saisissez une adresse e-mail valide.",
  },
};

export const dictionaries: Record<Locale, Dictionary> = { en, fr };
