from pathlib import Path
import fitz

source = Path("attached_assets/Festiland_-_Logo_1792547980857.pdf")
output_dir = Path(".agents/outputs")
output_dir.mkdir(parents=True, exist_ok=True)

document = fitz.open(source)
print(f"pages={document.page_count}")
for index, page in enumerate(document):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=True)
    destination = output_dir / f"festiland-logo-page-{index + 1}.png"
    pixmap.save(destination)
    print(destination)
    for image in page.get_images(full=True):
        extracted = document.extract_image(image[0])
        image_path = output_dir / f"festiland-logo-embedded-{image[0]}.{extracted['ext']}"
        image_path.write_bytes(extracted["image"])
        print(image_path)
