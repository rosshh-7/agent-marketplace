import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadAgent } from '../api/seller';
import { ApiError } from '../api/client';
import ErrorBanner from '../components/ErrorBanner';
import { useSellerAuth } from '../context/SellerAuthContext';

export default function SellerAgentUploadPage() {
  const { token } = useSellerAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [avgHours, setAvgHours] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError('Attach your agent as a .zip or .tar.gz file.');
      return;
    }
    if (!file.name.endsWith('.zip') && !file.name.endsWith('.tar.gz') && !file.name.endsWith('.tgz')) {
      setError('File must be a .zip, .tar.gz, or .tgz archive.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await uploadAgent(token, {
        name,
        description,
        category,
        hourlyRate: Number(hourlyRate),
        avgHours: Number(avgHours),
        file,
      });
      navigate(`/seller/agents/${res.submission_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <h1>Upload a new agent</h1>
      </div>
      <p className="page-subtitle">
        Submit your agent as a .zip or .tar.gz per the seller guide. It will be reviewed
        automatically (static analysis, sandboxed test runs, and an LLM judge) before it's
        listed.
      </p>

      <div className="card">
        <form onSubmit={handleSubmit}>
          <label>
            Agent name
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Description
            <textarea
              rows={4}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            Category
            <input
              type="text"
              required
              list="agent-categories"
              placeholder="e.g. code, content, data"
              value={category}
              // Lowercase so free-typed categories don't fragment the browse
              // filters into "Code" vs "code" duplicates.
              onChange={(e) => setCategory(e.target.value.toLowerCase())}
            />
            <datalist id="agent-categories">
              <option value="code" />
              <option value="content" />
              <option value="data" />
              <option value="design" />
              <option value="marketing" />
              <option value="research" />
              <option value="finance" />
              <option value="customer-support" />
            </datalist>
            <span className="hint-text">
              Pick an existing category when one fits — it keeps browsing filters tidy.
            </span>
          </label>
          <div className="form-row-split">
            <label>
              Hourly rate (USD)
              <input
                type="number"
                required
                min={0}
                step="0.01"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
              />
            </label>
            <label>
              Average hours per job
              <input
                type="number"
                required
                min={0}
                step="0.1"
                value={avgHours}
                onChange={(e) => setAvgHours(e.target.value)}
              />
            </label>
          </div>
          <label>
            Agent archive (.zip or .tar.gz)
            <input type="file" required accept=".zip,.tar.gz,.tgz,application/zip,application/gzip" ref={fileInputRef} />
          </label>
          <ErrorBanner message={error} />
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Uploading…' : 'Submit for review'}
          </button>
        </form>
      </div>
    </div>
  );
}
