# SchoolAid — Corrections de sécurité et notes de passation

**Date :** 14 juillet 2026
**Portée :** audit + correction directe du code. Rien de ce qui suit n'a été testé contre une vraie base Supabase (aucun accès réseau à Supabase depuis l'environnement où ces corrections ont été faites) — tout a été vérifié par lecture attentive, `tsc --noEmit` (0 erreur), `eslint` sur chaque fichier touché, et un `next build` complet qui va jusqu'au bout de la compilation (il échoue seulement sur le fetch des polices Google, bloqué par le réseau de cet environnement, pas par le code — sur Vercel ça passera).

Ce document a trois sections : **ce qui a été corrigé dans le code**, **ce qui ne pouvait pas être corrigé par du code et qui vous revient**, et **la liste complète des fichiers touchés**.

---

## 1. Ce qui a été corrigé

### 1.1 Secrets exposés et accès non authentifié

**`scripts/migrate.js`** — la clé `service_role` Supabase codée en dur (celle décodée dans l'audit précédent : projet `iojiahkehnijxxczrgft`) a été retirée. Le script lit maintenant `SUPABASE_SERVICE_ROLE_KEY` et `NEXT_PUBLIC_SUPABASE_URL` depuis l'environnement, et s'arrête proprement avec un message clair si l'une des deux manque. Le chemin Windows en dur (`D:\Web Apps\...\backup.sql`, propre à la machine du développeur d'origine) a aussi été retiré, remplacé par `MIGRATION_BACKUP_FILE` (variable d'environnement, avec fallback sur `./backup.sql`).

**`src/app/api/provision-admin/route.ts` — supprimée entièrement.** C'est la découverte la plus grave de cette session, pas mentionnée dans l'audit précédent car je ne l'avais pas encore examinée. C'était une route **GET**, donc déclenchable par une simple URL dans un navigateur, protégée par une vérification qui n'en est pas une :

```js
const secretKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback").substring(0, 10);
if (key !== secretKey) { ... }
```

Le problème : **tous** les JWT émis par Supabase (anon, service_role, peu importe le projet) commencent par le même en-tête fixe, donc les 10 premiers caractères de n'importe quelle clé Supabase sont **toujours** `eyJhbGciOi`. Ce n'est pas un secret propre à votre projet — c'est une constante publique et universelle à toute application Supabase. N'importe qui, sans connaître quoi que ce soit sur SchoolAid, pouvait appeler `GET /api/provision-admin?key=eyJhbGciOi` et la route :
- créait/réinitialisait un compte Super Admin à `admin@schoolaid.com` / `Admin123!` (identifiants fixes, voir plus bas),
- créait un admin pour chaque école qui n'en avait pas, avec un mot de passe faible,
- **renvoyait ces mots de passe en clair dans la réponse JSON**.

Si cette route a été déployée et exposée publiquement à un moment donné, il faut considérer que n'importe qui a pu s'en servir. Voir section 2.2.

**`src/app/login/page.tsx`** — la page de connexion affichait littéralement `admin@schoolaid.com / Admin123!` sous le formulaire, visible par quiconque visite la page, connecté ou non. Supprimé.

**`scripts/provision-admin.mjs`** — générait aussi `admin@schoolaid.com` / `Admin123!` en dur. Le mot de passe est maintenant généré aléatoirement à chaque exécution (`crypto.randomBytes`, ~144 bits d'entropie) et affiché une seule fois dans la console à la fin du script, avec un rappel de le noter et de le changer après la première connexion. L'email reste configurable via `SUPER_ADMIN_EMAIL` (ce n'est pas un secret, juste un identifiant).

**Trois projets Supabase différents codés en dur, retirés :**
| Fichier | Référence trouvée |
|---|---|
| `scripts/migrate.js`, `run-migration.js`, `run-migration-api.js` | `iojiahkehnijxxczrgft` |
| `scripts/run-seed.js` | `acxgfhvptoluhlxuttly` |

Aucun des deux ne correspond à votre environnement de staging officiel (`noyegdgrfzopfrwjunot`, celui du fichier `.env` qu'on vous a transmis). Les trois scripts dérivent maintenant l'hôte/le project ref depuis `NEXT_PUBLIC_SUPABASE_URL` — ils cibleront toujours le bon projet, quel que soit l'environnement. **Voir section 2.1 : ces deux références doivent être signalées à la personne qui vous a confié le projet.**

**`scripts/run_mig.js`** — connexion locale codée en dur (`postgres:password@localhost`). Lit maintenant `LOCAL_DATABASE_URL`.

### 1.2 Mots de passe en clair qui ne s'effaçaient jamais

La doc d'architecture (§3.7) prévoit que `generated_password` soit vidé après la première connexion. Ce n'était codé nulle part. En creusant pour corriger ça, j'ai trouvé un **deuxième bug, fonctionnel celui-là** : `must_change_password` n'était jamais remis à `false` non plus, nulle part dans le code — donc l'écran « changez votre mot de passe » aurait dû réapparaître à chaque connexion, indéfiniment, même pour les étudiants (le seul rôle où l'écran existait déjà). C'est corrigé dans **`src/app/api/auth/change-password/route.ts`** : après un changement réussi, `generated_password` est mis à `null` et `must_change_password` à `false` sur la ligne du compte concerné.

Conséquences en cascade de ce correctif :
- **`src/app/teacher/students/page.tsx`** : la colonne « Password » qui affichait le mot de passe de chaque élève en permanence dans la liste de l'enseignant a été retirée. Ce n'était de toute façon pas prévu par la doc (le partage de mot de passe est censé être un écran ponctuel pour la personne qui *crée* le compte, pas une colonne visible en continu par les enseignants).
- **`src/app/api/teacher/students/route.ts`** : ne renvoie plus `generated_password` dans la réponse JSON, même en interne, par sécurité en profondeur.
- **`get_creds.js`** (script qui dumpait tous les mots de passe des school_admins en clair) — supprimé, voir section 1.5.

**`src/app/api/super-admin/bulk-reset-passwords/route.ts`** — réinitialisait TOUS les comptes enseignants/élèves (d'une école ou, si `school_id` omis, de toute la plateforme) au même mot de passe fixe `"school123"`. Chaque compte reçoit maintenant son propre mot de passe unique généré via `generateUniquePassword`, exactement comme les flux de création/réinitialisation individuels.

**`src/lib/password.ts`** — le générateur produisait `PREFIXE_ÉCOLE + LETTRE_RÔLE + 5 chiffres` via `Math.random()` (100 000 combinaisons, PRNG non cryptographique). Remplacé par 8 caractères alphanumériques non ambigus (sans `0/O`, `1/I/L`) tirés avec `crypto.randomInt` — environ 10¹² combinaisons, cryptographiquement fort, toujours aussi facile à recopier à la main.

**Bug séparé trouvé en corrigeant tout ça : l'ordre des arguments de `generateUniquePassword` était inversé à 3 endroits** (`super-admin/reset-password`, `super-admin/schools/[id]/reset-password`, `super-admin/schools` à la création d'école) :
```js
// Avant (faux) : le slug de l'école passé comme "rôle", "school_admin" comme "nom d'école"
generateUniquePassword(supabase, school.slug, "school_admin")
// Après (correct)
generateUniquePassword(supabase, "school_admin", school.name)
```
Conséquence : `ROLE_LETTERS[school.slug]` ne matchait jamais rien, donc ces trois routes généraient systématiquement des mots de passe `SCHX________` génériques au lieu d'un préfixe identifiant la vraie école. Pas une faille de sécurité en soi (l'entropie de la partie aléatoire n'était pas affectée), mais un bug fonctionnel réel — corrigé aux trois endroits.

### 1.3 Contrôle d'accès enseignant (IDOR)

Nouveau fichier **`src/lib/teacher-scope.ts`** avec deux fonctions réutilisables : `resolveTeacherRowId` (résout l'id de la table `teachers` à partir du `profile_id`/`sub` du JWT — ce n'est pas la même valeur, piège facile) et `isTeacherAssignedToClass` / `verifyTeacherCanAccessStudent` (vérifie une vraie ligne dans `teacher_subjects` ou `class_teachers`).

Appliqué à :
- **`src/app/api/teacher/students/route.ts`** : vérifie que la classe demandée est bien assignée à l'enseignant avant de renvoyer la liste.
- **`src/app/api/teacher/scores/route.ts`** (GET et les 5 sous-types du POST — score, attendance, psychomotor, affective, comment) : même vérification, plus une vérification que l'élève ciblé appartient bien à l'école de l'enseignant (ça non plus ce n'était pas vérifié avant).
- **`src/app/api/teacher/publish/route.ts`** : vérifie que l'`assignment_id` fourni appartient bien à l'enseignant appelant (pas juste « appartient à un enseignant de l'école ») **et** correspond à la classe/matière effectivement demandée — avant, un enseignant pouvait référencer l'`assignment_id` d'un collègue autorisé à publier pour publier une classe qui n'était pas la sienne.

### 1.4 `verifySuperAdmin` — les deux bugs de l'audit précédent

Dans **`src/lib/api-auth.ts`** :
- La branche qui accordait l'accès Super Admin à **n'importe quelle session Supabase native valide**, sans vérifier le rôle, a été retirée. Elle était inatteignable en pratique (rien ne pose le cookie `sb-access-token`), mais dangereuse si quelqu'un active un jour l'auth Supabase native sans revoir cette fonction — un commentaire explique pourquoi et ce qu'il faudrait faire à la place.
- `verifySuperAdmin` renvoie maintenant le vrai `sub` du JWT au lieu d'un UUID `00000000-...` codé en dur. Ça corrige le journal d'audit d'impersonation (`support_logs.super_admin_id`, dans `api/super-admin/impersonate/route.ts`) qui enregistrait la même fausse valeur pour toutes les sessions d'impersonation, quel que soit le vrai Super Admin — impossible avant de savoir qui avait fait quoi.

### 1.5 Suppression des scripts dangereux ou obsolètes

| Fichier supprimé | Raison |
|---|---|
| `get_creds.js` | Dumpait en clair le mot de passe de tous les school_admins |
| `fix_admins.js` | Script de dépannage ponctuel, plus nécessaire |
| `scripts/reset_all_passwords.js` | Mot de passe partagé faible (`school123`), sans passer par une vérification d'autorisation — la route officielle `bulk-reset-passwords` fait la même chose correctement maintenant |
| `class_teachers_extracted.json` | Artefact de migration lié à un `backup.sql` local, introuvable dans ce projet |
| `scripts/extract_class_teachers.js` | Génère le fichier ci-dessus ; dépend d'un chemin Windows (`D:\Web Apps\...`) propre à une autre machine |

### 1.6 Secret JWT centralisé

Six fichiers avaient chacun leur propre copie de :
```js
process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback-insecure-secret"
```
Un environnement mal configuré (JWT_SECRET absent) signait alors silencieusement toutes les sessions avec la clé `service_role` (un secret bien plus sensible, prévu pour un usage totalement différent) ou, pire, avec le texte fixe `"fallback-insecure-secret"`, identique et devinable pour toute application utilisant ce code.

Remplacé par un point unique, **`src/lib/jwt-secret.ts`**, qui lève une erreur explicite si `JWT_SECRET` est absent ou trop court. Comme chaque appelant est déjà dans un `try/catch` (ou laisse le framework gérer l'erreur), l'effet concret est : *pas de JWT_SECRET = personne ne peut se connecter*, plutôt que *pas de JWT_SECRET = tout le monde se connecte avec un secret faible partagé*. C'est le comportement inverse de l'ancien, et c'est intentionnel — mieux vaut un échec visible qu'une faille silencieuse. **Ça veut dire que `JWT_SECRET` doit être défini dans les trois environnements (local, staging, production) avant de démarrer l'app — voir la checklist en section 2.4.**

Fichiers touchés : `middleware.ts`, `lib/api-auth.ts`, `lib/school-auth.ts`, `api/auth/login/route.ts`, `api/auth/change-password/route.ts`, `api/auth/me/route.ts`, `api/super-admin/impersonate/route.ts`.

### 1.7 Formulaire de mot de passe qui ne servait à rien

En corrigeant `must_change_password`, j'ai découvert que **`src/app/teacher/layout.tsx`** et **`src/app/school-admin/layout.tsx`** n'avaient pas l'écran de changement forcé du tout (seul `student/layout.tsx` l'avait). Ajouté aux deux, sur le même modèle que celui des étudiants.

En l'ajoutant pour les enseignants, j'ai trouvé un troisième bug : leur formulaire « nouveau mot de passe / confirmation » envoyait `newPassword` à l'API, mais **`change-password/route.ts` ignore silencieusement cette valeur pour tout rôle autre que `super_admin`** et génère un mot de passe aléatoire à la place. Un enseignant qui utilisait ce formulaire recevait donc un message « mot de passe changé » alors que son vrai nouveau mot de passe était différent de celui qu'il venait de taper — et ne le voyait jamais. Plutôt que de réécrire la logique serveur (risqué à faire sans pouvoir tester contre votre vraie base), j'ai aligné l'interface enseignant sur le pattern « générer et révéler » déjà utilisé (et qui fonctionne) côté étudiant. `school-admin/layout.tsx` utilisait déjà ce bon pattern, donc rien à changer côté logique là-bas, juste l'ajout du gate.

---

## 2. Ce qui vous revient — pas corrigeable par du code

### 2.1 À signaler à la personne qui vous a confié le projet

Trois références de projet Supabase différentes traînent dans ce code (voir 1.1), aucune ne correspondant à votre staging officiel `noyegdgrfzopfrwjunot` :
- `iojiahkehnijxxczrgft` — celle dont la clé `service_role` était codée en clair dans `migrate.js`. **Si cette personne contrôle encore ce projet, sa clé doit être régénérée** — elle a circulé dans du code qui a changé de mains (y compris dans cette conversation).
- `acxgfhvptoluhlxuttly` — trouvée dans `run-seed.js`, jamais expliquée.

Je ne peux pas savoir d'ici si ce sont des sandbox de développement abandonnées ou autre chose — mais ça vaut la peine de demander.

### 2.2 Le compte `admin@schoolaid.com` a peut-être déjà été créé avec `Admin123!`

Retirer le mot de passe en dur du code (fait, section 1.1) n'efface pas un compte qui aurait déjà été créé avec ce mot de passe dans votre vraie base, que ce soit via `provision-admin.mjs`, l'ancienne route `/api/provision-admin` (potentiellement appelée par n'importe qui, voir 1.1), ou `fix_admins.js`. **Vérifiez dans votre dashboard Supabase (staging `noyegdgrfzopfrwjunot`) si ce compte existe, et si oui, changez son mot de passe manuellement dès maintenant**, indépendamment de tout le reste. Pareil pour tout compte `admin@<slug>.edu` créé par ces scripts avec un mot de passe `Admin####!` prévisible.

### 2.3 Si `reset_all_passwords.js` a déjà été exécuté

Ce script (supprimé, section 1.5) mettait tous les comptes au mot de passe `school123`. S'il a déjà tourné une fois contre de vraies données, le supprimer du dépôt ne change rien aux mots de passe déjà en place. Il faudrait passer par la route corrigée `bulk-reset-passwords` (ou individuellement) pour redistribuer de vrais mots de passe uniques à tout le monde.

### 2.4 Checklist avant tout déploiement

- [ ] Régénérer la clé `service_role` du projet `iojiahkehnijxxczrgft` si vous/le porteur du projet le contrôlez encore
- [ ] Vérifier/nettoyer le compte `admin@schoolaid.com` (section 2.2)
- [ ] Définir `JWT_SECRET` — une vraie valeur aléatoire (`openssl rand -base64 32`), **différente** de `SUPABASE_SERVICE_ROLE_KEY` — en local (`.env.local`), en staging (Vercel) et en production. Sans ça, plus personne ne peut se connecter (voir 1.6, c'est voulu).
- [ ] Confirmer qu'un `.gitignore` racine est bien pris en compte par git (celui ajouté ici couvre `.env*`, `node_modules`, `.next`, `migration_credentials.txt`)
- [ ] Si vous relancez `scripts/provision-admin.mjs`, noter le mot de passe affiché une seule fois en console

### 2.5 Ce que je n'ai délibérément PAS touché

**Le modèle RLS / hook JWT décrit dans le document d'architecture (§3.2) n'est toujours pas branché** — c'est le point le plus structurel de l'audit précédent, et je ne l'ai pas rearchitecturé ici. Raison : c'est un changement qui toucherait la façon dont l'authentification fonctionne pour les 44 routes API, et je n'ai aucun moyen de le tester contre votre vraie base Supabase depuis cet environnement (pas d'accès réseau à `*.supabase.co`). Le corriger à l'aveugle aurait été plus risqué que de le laisser tel quel avec ses limites documentées. Ce que j'ai fait à la place : corriger les bugs concrets et vérifiables à l'intérieur du modèle actuel (accès enseignant, mots de passe, secrets). Si vous voulez qu'on s'attaque au hook `custom_access_token` + RLS ensuite, je peux préparer la migration SQL et le code, mais ce sera à tester vous-même contre le staging avant tout déploiement.

Je n'ai pas non plus touché :
- La numérotation dupliquée des migrations (006, 008, 009, 012 en double) — toujours là, mais `staging_complete_schema.sql` documente déjà l'ordre réel, donc ce n'est pas bloquant.
- Une poignée d'avertissements ESLint préexistants sans lien avec la sécurité (usage de `any`, et dans `school-admin/layout.tsx` des composants définis à l'intérieur du rendu — présents avant mes modifications, vérifié en comparant avec le fichier d'origine). Aucun n'empêche l'app de fonctionner ; je peux les nettoyer dans une passe séparée si utile.

---

## 3. Fichiers touchés

**Créés (4)** : `.gitignore` · `src/lib/jwt-secret.ts` · `src/lib/teacher-scope.ts` · `docs/CORRECTIONS_SECURITE.md`

**Supprimés (6)** : `get_creds.js` · `fix_admins.js` · `scripts/reset_all_passwords.js` · `class_teachers_extracted.json` · `scripts/extract_class_teachers.js` · `src/app/api/provision-admin/route.ts`

**Modifiés (25)** :
`src/middleware.ts` · `src/lib/api-auth.ts` · `src/lib/school-auth.ts` · `src/lib/password.ts` · `src/app/api/auth/login/route.ts` · `src/app/api/auth/change-password/route.ts` · `src/app/api/auth/me/route.ts` · `src/app/api/super-admin/impersonate/route.ts` · `src/app/api/super-admin/bulk-reset-passwords/route.ts` · `src/app/api/super-admin/reset-password/route.ts` · `src/app/api/super-admin/schools/route.ts` · `src/app/api/super-admin/schools/[id]/reset-password/route.ts` · `src/app/api/teacher/students/route.ts` · `src/app/api/teacher/scores/route.ts` · `src/app/api/teacher/publish/route.ts` · `src/app/teacher/layout.tsx` · `src/app/teacher/students/page.tsx` · `src/app/school-admin/layout.tsx` · `src/app/login/page.tsx` · `scripts/migrate.js` · `scripts/run-migration.js` · `scripts/run-migration-api.js` · `scripts/run-seed.js` · `scripts/run_mig.js` · `scripts/provision-admin.mjs`

Chaque changement porte un commentaire dans le code renvoyant vers ce document (`voir docs/CORRECTIONS_SECURITE.md`), pour qu'on retrouve le contexte directement en lisant le fichier concerné.
