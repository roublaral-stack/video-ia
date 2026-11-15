# Audit des intégrations — 15 novembre 2026

Les URL ont été fournies par l'utilisateur. L'accès Git HTTPS et les fichiers réels ont été inspectés ; aucun chemin de projet personnel n'a été supposé. Les copies d'audit sous `/tmp` ne sont pas modifiées et ne sont pas ajoutées à VIDEO IA.

| Composant | Preuve examinée | État réel |
|---|---|---|
| VIDEO IA | commit `fc9cdb3`, scripts project/import, modèle, ZIP, tests | Réutilisé, pas reconstruit |
| Remotion / SnapCN | Remotion 4.0.543, source MIT TextReveal, `/usr/bin/chromium` | Rendu réel ; composition originale et style classique avec SnapCN conservés ; nouvelle direction cinématique avec animations Remotion discrètes |
| Chatterbox | https://github.com/resemble-ai/chatterbox, HEAD `ab55923c27757c90cfcc407baa57dc25a7d25217`, README, pyproject et mtl_tts.py | Dépôt accessible ; API Python vérifiée ; inférence indisponible dans cette machine |
| Brag | https://github.com/latent-spaces/brag, HEAD `669ab9286aa28b6c3ee30e75f181ee74319d012a`, README, scripts et manifeste | Dépôt accessible ; skill agent/Hyperframes, pas une API de scènes documentée |
| Voix de démo | @echogarden/espeak-ng-emscripten 0.3.5 | Synthèse française locale opérationnelle ; ne reproduit pas la voix de Corentin |

## Chatterbox

Le pont `reel/adapters/chatterbox.py` reprend l'API constatée :

```python
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
model = ChatterboxMultilingualTTS.from_local(model_directory, device="cpu", t3_model="v3")
audio = model.generate(text, language_id="fr", audio_prompt_path=reference_audio,
                       exaggeration=0.5, cfg_weight=0.5)
```

`torchaudio.save` écrit les phrases. Le pont ne modifie aucun dépôt externe et n'installe rien. Il n'est **pas validé en inférence** : chatterbox, torch, torchaudio et les modèles sont absents. L'accès HTTP au dépôt de modèles réel `huggingface.co/ResembleAI/chatterbox` retournait CONNECT 403 du proxy lors de l'audit. La nouvelle passerelle utilise `from_local`, vérifié dans `mtl_tts.py` au commit ci-dessus, pour éviter tout téléchargement implicite. Aucun contrôle réseau n'a été contourné.

Pour l'activer ultérieurement, fournir l'interpréteur réel dans `narration.python`, les poids locaux dans `modelDirectory`, la référence autorisée dans `referenceAudio` et un script validé dans `text`. Rien ne suppose leur présence dans le projet Voix off. Les chemins contenant `/` sont relatifs au JSON. Le précontrôle vérifie le runtime et les fichiers `ve.pt`, `s3gen.pt`, `t3_mtl23ls_v3.safetensors`, `grapheme_mtl_merged_expanded_v1.json` ; `conds.pt` reste facultatif dans l'API amont puisque la référence est explicitement requise ici. Une erreur arrête la production. Aucune valeur secrète n'est demandée dans le chat.

`pipeline-config/chatterbox.example.json` est un exemple conditionnel, pas la preuve d'une installation. `speed` concerne seulement la voix de démo ; aucune option native de vitesse Chatterbox n'est inventée. Paramètres vérifiés : français, CPU/CUDA/MPS, exagération et CFG. `referenceAudio` est obligatoire pour ce parcours de production personnalisé, privé, jamais utilisé dans la démo ni ajouté à l'archive. Le README amont annonce la recherche archivée/non maintenue depuis août 2026 ; le pont est lié à l'API du commit audité.

Sans runtime, utiliser `engine: files` avec le WAV et son SRT exportés du projet Voix off. C'est le parcours réellement utilisé pour l'aperçu personnel : aucune synthèse n'est exécutée, la piste originale est préservée et comparée à l'AAC final. Le mode acoustique PocketSphinx recale le transcript fourni sur le signal local, sans revendiquer une reconnaissance indépendante des paroles. La revue à l'écoute reste humaine.

## Brag

Le README documente `/brag` comme skill pilotant Hyperframes, avec `brag-output/brag.mp4` en sortie. Sa narration est désactivée par défaut et utilise Kokoro lorsqu'elle est activée, pas Chatterbox. Son script Python analyse les repères musicaux ; ce n'est pas un générateur de scènes.

VIDEO IA prépare un `brag-brief.md` pour le modèle application. Après une exécution de Brag dans son environnement, fournir les captures ou le MP4 dans `brag.files`. L'import normalise les médias, coupe leur son et conserve la narration choisie dans VIDEO IA. Aucun endpoint Brag, agent ou appel Hyperframes fictif n'est introduit ; aucune musique tierce n'est copiée implicitement. Éducatif et Vlog refusent l'activation de Brag et n'en dépendent pas.

L'import des exports est testé avec des fichiers synthétiques. La création créative initiale du film Brag reste manuelle.
