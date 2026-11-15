# Audit des intégrations — 15 novembre 2026

Les URL ont été fournies par l'utilisateur. L'accès Git HTTPS et les fichiers réels ont été inspectés ; aucun chemin de projet personnel n'a été supposé. Les copies d'audit sous `/tmp` ne sont pas modifiées et ne sont pas ajoutées à VIDEO IA.

| Composant | Preuve examinée | État réel |
|---|---|---|
| VIDEO IA | commit `fc9cdb3`, scripts project/import, modèle, ZIP, tests | Réutilisé, pas reconstruit |
| Remotion / SnapCN | Remotion 4.0.543, source MIT TextReveal, `/usr/bin/chromium` | Rendu réel ; `titleAnimation: snapcn` pour la production ; compositions antérieures conservées |
| Chatterbox | https://github.com/resemble-ai/chatterbox, HEAD `ab55923c27757c90cfcc407baa57dc25a7d25217`, README, pyproject et mtl_tts.py | Dépôt accessible ; API Python vérifiée ; inférence indisponible dans cette machine |
| Brag | https://github.com/latent-spaces/brag, HEAD `669ab9286aa28b6c3ee30e75f181ee74319d012a`, README, scripts et manifeste | Dépôt accessible ; skill agent/Hyperframes, pas une API de scènes documentée |
| Voix de démo | @echogarden/espeak-ng-emscripten 0.3.5 | Synthèse française locale opérationnelle ; ne reproduit pas la voix de Corentin |

## Chatterbox

Le pont `reel/adapters/chatterbox.py` reprend l'API constatée :

```python
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
model = ChatterboxMultilingualTTS.from_pretrained(device="cpu", t3_model="v3")
audio = model.generate(text, language_id="fr", exaggeration=0.5, cfg_weight=0.5)
```

`torchaudio.save` écrit les phrases. Le pont ne modifie aucun dépôt externe et n'installe rien. Il n'est **pas validé en inférence** : chatterbox, torch, torchaudio et les modèles sont absents. L'accès HTTP au dépôt de modèles réel `huggingface.co/ResembleAI/chatterbox` retourne CONNECT 403 du proxy. L'API utilise snapshot_download puis les fichiers de poids/tokenizer et conds.pt. Aucun téléchargement ou contrôle de confiance n'a été contourné.

Pour l'activer, préparer un interpréteur Python séparé conforme au dépôt audité avec ses dépendances et modèles, puis renseigner `narration.python` dans un JSON privé. Les chemins contenant `/` sont relatifs au fichier de configuration. Un cache Hugging Face complet peut être utilisé avec `HF_HUB_OFFLINE=1`. Aucune valeur secrète n'est demandée dans le chat. Un éventuel HF_TOKEN appartient aux paramètres sécurisés de l'environnement, pas aux JSON/arguments.

`pipeline-config/chatterbox.example.json` est un exemple conditionnel, pas la preuve d'une installation. `speed` concerne seulement la voix de démo ; aucune option native de vitesse Chatterbox n'est inventée. Paramètres vérifiés : français, CPU/CUDA/MPS, exagération et CFG. `referenceAudio` est facultatif, privé, jamais utilisé dans la démo et jamais ajouté à l'archive. Le README amont annonce la recherche archivée/non maintenue depuis août 2026 ; le pont est lié à l'API du commit audité.

Sans runtime, utiliser `engine: files` avec l'audio et son SRT exportés du projet Voix off. Ce mode ne prétend pas appeler Chatterbox ni vérifier lexicalement l'enregistrement.

## Brag

Le README documente `/brag` comme skill pilotant Hyperframes, avec `brag-output/brag.mp4` en sortie. Sa narration est désactivée par défaut et utilise Kokoro lorsqu'elle est activée, pas Chatterbox. Son script Python analyse les repères musicaux ; ce n'est pas un générateur de scènes.

VIDEO IA prépare un `brag-brief.md` pour le modèle application. Après une exécution de Brag dans son environnement, fournir les captures ou le MP4 dans `brag.files`. L'import normalise les médias, coupe leur son et conserve la narration choisie dans VIDEO IA. Aucun endpoint Brag, agent ou appel Hyperframes fictif n'est introduit ; aucune musique tierce n'est copiée implicitement. Éducatif et Vlog refusent l'activation de Brag et n'en dépendent pas.

L'import des exports est testé avec des fichiers synthétiques. La création créative initiale du film Brag reste manuelle.
