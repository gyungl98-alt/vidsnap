#!/usr/bin/env python3
"""
Image Preprocessing for OCR
Improves OCR accuracy by processing blurry/low-contrast images
"""

import cv2
import numpy as np
import sys
import json
from pathlib import Path

def preprocess_image(image_path, output_path):
    """
    Preprocess image: grayscale, deblur, contrast enhancement
    Returns: success, error message
    """
    try:
        # Read image
        img = cv2.imread(image_path)
        if img is None:
            return False, "Could not read image"
        
        # Step 1: Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Step 2: Denoise (reduce blur)
        denoised = cv2.fastNlMeansDenoising(gray, h=10, templateWindowSize=7, searchWindowSize=21)
        
        # Step 3: Contrast enhancement (CLAHE - Contrast Limited Adaptive Histogram Equalization)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        contrast_enhanced = clahe.apply(denoised)
        
        # Step 4: Binary threshold for very clear text
        _, binary = cv2.threshold(contrast_enhanced, 127, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Step 5: Slight dilation to fill small holes
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
        processed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)
        
        # Save processed image
        cv2.imwrite(output_path, processed)
        
        return True, "Image preprocessed successfully"
    
    except Exception as e:
        return False, str(e)

def main():
    """CLI interface for preprocessing"""
    if len(sys.argv) < 3:
        print(json.dumps({
            "success": False,
            "error": "Usage: python imagePreprocessor.py <input_path> <output_path>"
        }))
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    success, message = preprocess_image(input_path, output_path)
    
    print(json.dumps({
        "success": success,
        "message": message,
        "output": output_path if success else None
    }))

if __name__ == "__main__":
    main()
