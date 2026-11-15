# Sources et droits

- Illustrations aquarium, poissons, plantes et bulles : créations procédurales originales pour cette démonstration, dans `src/Reel.tsx` et `scripts/render-fallback.py`. Aucun média téléchargé ou photographie utilisé. Mention visible « Démo · Illustrations originales de substitution ». Aucun logo officiel fourni : la marque est un simple texte.
- SnapCN `TextReveal` et thème : https://github.com/snapcndev/snapcn, commit `18b973d7592adf2099a4d5cc2d8970862a4e1172`. Licence MIT conservée dans `src/components/snap-cn/LICENSE`. Source copiée depuis `registry/snap-cn/text-reveal/index.tsx` et `registry/snap-cn-ui/core/theme.ts`. Seul l'import du module de thème est relocalisé ; `src/lib/snap-cn-ui.ts` adapte la résolution de police à une police locale pour éviter des téléchargements Google Fonts. Le registre snapcn.dev était inaccessible ; copie depuis le dépôt officiel via Git.
- Police DejaVu Sans embarquée : avis complet dans `public/fonts/COPYRIGHT`.
- Remotion et ses dépendances : versions figées dans package-lock.json ; leurs licences restent celles des projets respectifs. Les conditions Remotion dépendent de l'usage et de la taille de l'organisation.
- Démo silencieuse : aucune musique ni voix off, donc aucun enregistrement tiers utilisé.
