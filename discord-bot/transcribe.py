import sys
import json
import os

os.environ['XDG_CACHE_HOME'] = 'D:\\whisper-models'

import whisper

def transcribe(audio_path, language='en'):
    try:
        model  = whisper.load_model('small')
        result = model.transcribe(audio_path, language=language, fp16=False)
        print(json.dumps({
            'success':  True,
            'text':     result['text'].strip(),
            'language': result['language']
        }))
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error':   str(e)
        }))

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'No audio file provided'}))
    else:
        lang = sys.argv[2] if len(sys.argv) > 2 else 'en'
        transcribe(sys.argv[1], lang)