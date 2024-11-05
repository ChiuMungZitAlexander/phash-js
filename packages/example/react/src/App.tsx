import { useState } from "react";
import { phash } from "@phash-js/client/src/index";

const App = () => {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | ArrayBuffer | null>(null);
  const [hash, setHash] = useState("");

  // Handle image selection
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);

      // Show preview
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  // Handle image upload
  const handlePhash = async () => {
    if (!selectedImage) return;

    try {
      const _hash = await phash(selectedImage);

      if (_hash) {
        setHash(_hash);
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <input type="file" accept="image/*" onChange={handleImageChange} />
      {preview && (
        <img
          src={preview as string}
          alt="Preview"
          style={{ width: "200px", margin: "10px" }}
        />
      )}
      <button
        onClick={handlePhash}
        disabled={!selectedImage}
        style={{ width: "128px", margin: "10px" }}
      >
        phash
      </button>
      {hash && <h3>{hash}</h3>}
    </div>
  );
};

export default App;
