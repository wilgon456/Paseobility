#!/usr/bin/env python3
"""Transcribe a local Discord voice attachment with faster-whisper on CPU."""
import argparse
import json
import os
from pathlib import Path
import sys


def transcribe(path, model_name, language=None):
    from faster_whisper import WhisperModel
    model = WhisperModel(model_name, device='cpu', compute_type='int8')
    segments, info = model.transcribe(str(path), language=language, beam_size=3, vad_filter=True)
    return {'language': info.language, 'text': ' '.join(segment.text.strip() for segment in segments).strip()}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('audio', type=Path)
    parser.add_argument('--model', default=os.environ.get('PASEO_BOT_WHISPER_MODEL', 'base'))
    parser.add_argument('--language', default=None)
    args = parser.parse_args(argv)
    try:
        result = transcribe(args.audio, args.model, args.language)
        print(json.dumps({'ok': True, **result}, ensure_ascii=False))
        return 0
    except ImportError:
        print(json.dumps({'ok': False, 'error': 'faster-whisper is not installed; see requirements-media.txt'}))
    except Exception as error:
        # Audio contents and provider/configuration data are never echoed in an error.
        print(json.dumps({'ok': False, 'error': 'transcription failed', 'kind': type(error).__name__}))
    return 1


if __name__ == '__main__':
    sys.exit(main())
