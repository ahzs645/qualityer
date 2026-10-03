"""Model selection only; no model imports and no fabricated inference."""
def alignment_for_language(whisperx, current, language, device):
    if current is None or current[1].get('language') != language:
        return whisperx.load_align_model(language_code=language, device=device)
    return current
