"""
OCR Service for DMSCode
Provides REST API for OCR processing using Tesseract/OCRmyPDF
"""

from flask import Flask, request, jsonify, send_file
import subprocess
import tempfile
import os
import magic
import functools

app = Flask(__name__)

API_KEY = os.environ.get('DMS_API_KEY')

def require_api_key(f):
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        if API_KEY:
            key = request.headers.get('X-API-KEY')
            if not key or key != API_KEY:
                return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated_function

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'dmscode-ocr',
        'version': '1.0.0'
    })

@app.route('/ocr', methods=['POST'])
@require_api_key
def ocr():
    """
    OCR endpoint - accepts PDF or image files
    Returns extracted text
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    lang = request.form.get('lang', 'deu+eng')
    output_format = request.form.get('format', 'text')  # text or pdf
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    # Save uploaded file
    suffix = os.path.splitext(file.filename)[1] or '.pdf'
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as input_file:
        file.save(input_file.name)
        input_path = input_file.name
    
    try:
        # Detect file type
        mime = magic.Magic(mime=True)
        file_type = mime.from_file(input_path)
        
        if file_type == 'application/pdf':
            # Process PDF with OCRmyPDF
            output_path = input_path.replace(suffix, '_ocr.pdf')
            
            result = subprocess.run([
                'ocrmypdf',
                '-l', lang,
                '--force-ocr',
                '--skip-text',
                '--output-type', 'pdf',
                input_path,
                output_path
            ], capture_output=True, text=True)
            
            if result.returncode != 0 and 'PriorOcrFoundError' not in result.stderr:
                # Try without --skip-text
                result = subprocess.run([
                    'ocrmypdf',
                    '-l', lang,
                    '--force-ocr',
                    input_path,
                    output_path
                ], capture_output=True, text=True)
            
            # Extract text with pdftotext
            text_result = subprocess.run([
                'pdftotext',
                output_path if os.path.exists(output_path) else input_path,
                '-'
            ], capture_output=True, text=True)
            
            extracted_text = text_result.stdout
            
            if output_format == 'pdf' and os.path.exists(output_path):
                response = send_file(output_path, mimetype='application/pdf')
                # Cleanup after sending
                os.unlink(input_path)
                os.unlink(output_path)
                return response
            
            # Cleanup
            os.unlink(input_path)
            if os.path.exists(output_path):
                os.unlink(output_path)
                
        elif file_type.startswith('image/'):
            # Process image with Tesseract directly
            result = subprocess.run([
                'tesseract',
                input_path,
                'stdout',
                '-l', lang
            ], capture_output=True, text=True)
            
            extracted_text = result.stdout
            os.unlink(input_path)
        else:
            os.unlink(input_path)
            return jsonify({'error': f'Unsupported file type: {file_type}'}), 400
        
        return jsonify({
            'success': True,
            'text': extracted_text,
            'language': lang,
            'file_type': file_type
        })
        
    except Exception as e:
        # Cleanup on error
        if os.path.exists(input_path):
            os.unlink(input_path)
        return jsonify({'error': str(e)}), 500

@app.route('/languages', methods=['GET'])
def get_languages():
    """Get available OCR languages"""
    result = subprocess.run(['tesseract', '--list-langs'], capture_output=True, text=True)
    languages = result.stdout.strip().split('\n')[1:]  # Skip header
    return jsonify({
        'languages': languages,
        'default': 'deu+eng'
    })

if __name__ == '__main__':
    print("Starting DMSCode OCR Service on port 8510...")
    app.run(host='0.0.0.0', port=8510, debug=False)
