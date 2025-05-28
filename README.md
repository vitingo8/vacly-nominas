# PDF Splitter & Text Extractor + Claude AI with Voyage RAG Memory

A modern web application built with Next.js, TypeScript, and React that allows you to upload PDF files, split them into individual pages, extract text content, and process documents using Claude AI with advanced RAG (Retrieval Augmented Generation) memory system powered by **Voyage AI** embeddings and automatic Supabase storage.

## Features

- 📄 **PDF Upload**: Upload PDF files through a clean, modern interface
- ✂️ **PDF Splitting**: Automatically split multi-page PDFs into individual page files
- 📝 **Text Extraction**: Extract text content from each page using pdf-parse
- 👀 **Text Viewer**: View extracted text content without downloading
- 💾 **Download Options**: Download individual PDF pages and text files
- 🤖 **Claude AI Integration**: Process documents with Claude AI using intelligent context
- 🧠 **Voyage RAG Memory**: Advanced AI memory powered by Voyage AI embeddings (officially recommended by Anthropic)
- 🔍 **Semantic Search**: Vector-based similarity search using Voyage 3 Lite model
- 📊 **Memory Analytics**: Real-time monitoring of learned patterns and AI performance
- ⚡ **Batch Processing**: Process all documents with Claude AI at once with memory enhancement
- 📊 **Excel Export**: Export all processed data to Excel with multiple sheets
- 🗄️ **Supabase Storage**: Automatically save processed data with full audit trails
- 🎨 **Modern UI**: Beautiful, responsive interface built with Tailwind CSS and Shadcn/UI
- ⚡ **Fast Processing**: Efficient server-side processing with progress indicators

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS, Shadcn/UI components
- **PDF Processing**: PDF-lib (splitting), pdf-parse (text extraction)
- **AI Processing**: Anthropic Claude API with RAG enhancement
- **Vector Database**: Supabase with pgvector extension
- **Embeddings**: Voyage AI (voyage-3.5-lite) - Officially recommended by Anthropic
- **Database**: Supabase (PostgreSQL) with vector search capabilities
- **Excel Export**: xlsx library
- **Icons**: Lucide React
- **File Handling**: Built-in Next.js API routes with FormData

## Voyage AI RAG System

### Why Voyage AI?

We use **Voyage AI (voyage-3.5-lite)** instead of OpenAI for embeddings because:

- ✅ **Officially recommended by Anthropic** for Claude integrations
- ✅ **Optimized specifically for RAG** with Claude models
- ✅ **More cost-effective** than OpenAI embeddings
- ✅ **Better performance** on document retrieval tasks
- ✅ **512-dimensional vectors** (vs 1536 from OpenAI) for faster processing
- ✅ **Specialized input types** for documents vs queries
- ✅ **Batch processing** up to 128 inputs per request

### How It Works

The application implements a sophisticated RAG system enhanced with Voyage AI:

1. **Document Embedding**: Text chunks are converted to 512-dimensional vectors using `voyage-3.5-lite`
2. **Query Optimization**: Search queries use `inputType: 'query'` for better retrieval
3. **Pattern Learning**: System learns from each processed document per company/employee
4. **Semantic Search**: pgvector with HNSW indices for ultra-fast similarity search
5. **Context Enhancement**: Claude receives enriched context with relevant examples
6. **Memory Evolution**: Continuous improvement of company-specific patterns

### Key Components

- **Vector Embeddings**: 512-dimension vectors using Voyage 3 Lite model
- **Dual Input Types**: Separate embeddings for documents and search queries
- **Pattern Recognition**: Automatic extraction of company-specific structures
- **Company Memory**: Isolated memory patterns per company for data security
- **Employee Patterns**: Individual learning patterns when applicable
- **Confidence Scoring**: Dynamic confidence that improves with usage

### Benefits

- **Improved Accuracy**: Claude gets better at processing company documents over time
- **Cost Efficiency**: Voyage AI is more economical than OpenAI for embeddings
- **Faster Processing**: 512-dimensional vectors process faster than 1536-dimensional
- **Better Integration**: Optimized specifically for Claude AI workflows
- **Consistency**: Similar documents processed with learned patterns

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Anthropic API key (for Claude)
- Voyage AI API key (for embeddings) - Get it at [voyage.ai](https://www.voyageai.com/)
- Supabase project with proper schema

### Environment Setup

Create a `.env.local` file in the root directory:
```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Anthropic Claude API
ANTHROPIC_API_KEY=your_anthropic_api_key

# Voyage AI (Recommended by Anthropic for Claude)
VOYAGE_API_KEY=your_voyage_api_key
```

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd vacly-nominas
```

2. Install dependencies:
```bash
npm install
```

3. Set up Supabase database with required tables (see Database Schema section)

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Basic PDF Processing

1. **Upload a PDF**: Click on the file input and select a PDF file from your computer
2. **Processing**: The app will automatically:
   - Upload the file to Supabase storage
   - Split the PDF into individual pages
   - Extract text content from each page
   - Create entries in the processed_documents table
   - Generate Voyage AI embeddings for future RAG searches
3. **View Results**: 
   - Browse through the split documents in the left panel
   - Click on any document to view its text content
   - Use the download buttons to save individual files

### AI-Enhanced Document Processing

1. **Process with Claude**: Click the 🧠 (Brain) button on any document
2. **Voyage RAG Enhancement**: The system automatically:
   - Searches for similar documents using Voyage query embeddings
   - Retrieves relevant company and employee patterns
   - Builds enriched context with learned patterns and examples
   - Sends enhanced prompt to Claude with contextual information
3. **AI Analysis**: Claude analyzes the document with improved context and extracts structured data
4. **Memory Update**: System updates its memory with new patterns and improves future processing
5. **Automatic Storage**: Processed data is saved to Supabase with full audit trails

### Memory Analytics Dashboard

Monitor your Voyage AI-powered memory system:

- **Memory Patterns**: View learned patterns with confidence scores
- **Vector Embeddings**: Track total indexed text chunks (512-dimensional)
- **Document Statistics**: Monitor processing success rates
- **Recent Activity**: See latest document processing activity
- **Performance Metrics**: Track pattern usage and improvement over time

### Batch Processing & Excel Export

1. **Batch Processing**: 
   - Process all documents with enhanced Voyage RAG context
   - Each document benefits from accumulated learning
   - Real-time progress with memory updates
   - Continuous improvement throughout batch processing

2. **Excel Export**:
   - Multi-sheet Excel files with comprehensive data
   - Enhanced data consistency thanks to learned patterns
   - Automatic formatting based on company patterns

## Database Schema

### Core Tables

```sql
-- Document types (extensible for different document categories)
CREATE TABLE document_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  processing_prompt TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Main processed documents table
CREATE TABLE processed_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_filename VARCHAR(255) NOT NULL,
  document_type_id UUID NOT NULL REFERENCES document_types(id),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  employee_id UUID REFERENCES employees(id),
  extracted_text TEXT NOT NULL,
  processed_data JSONB,
  processing_status VARCHAR(20) DEFAULT 'pending',
  processing_error TEXT,
  split_pdf_paths TEXT[],
  text_file_paths TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Vector embeddings for RAG search (Voyage AI 512 dimensions)
CREATE TABLE document_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES processed_documents(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(company_id),
  document_type_id UUID NOT NULL REFERENCES document_types(id),
  employee_id UUID REFERENCES employees(id),
  text_chunk TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding vector(512), -- Voyage 3 Lite dimensions
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- AI memory patterns
CREATE TABLE document_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  employee_id UUID REFERENCES employees(id),
  document_type_id UUID NOT NULL REFERENCES document_types(id),
  conversation_id UUID NOT NULL,
  summary TEXT NOT NULL,
  learned_patterns JSONB DEFAULT '{}',
  keywords TEXT[] DEFAULT '{}',
  confidence_score DECIMAL(3,2) DEFAULT 0.0,
  usage_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Original nominas table for payroll data
CREATE TABLE nominas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  employee JSONB NOT NULL,
  company JSONB NOT NULL,
  perceptions JSONB NOT NULL,
  deductions JSONB NOT NULL,
  contributions JSONB NOT NULL,
  base_ss NUMERIC(12,2),
  net_pay NUMERIC(12,2),
  iban TEXT,
  swift_bic TEXT,
  cost_empresa NUMERIC(12,2),
  signed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  FOREIGN KEY (company_id) REFERENCES companies(company_id),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);
```

### Vector Search Function (Voyage AI)

```sql
-- Semantic search function for Voyage AI embeddings
CREATE OR REPLACE FUNCTION search_similar_documents_voyage(
  query_embedding vector(512),
  company_id uuid,
  document_type_name text,
  similarity_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  text_chunk text,
  similarity_score float,
  processed_data jsonb,
  document_type text,
  employee_id uuid,
  metadata jsonb
)
```

## Project Structure

```
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── upload/              # File upload API route
│   │   │   ├── process/             # PDF processing with document creation
│   │   │   ├── process-nomina/      # Claude AI processing with Voyage RAG
│   │   │   ├── memory-status/       # Memory analytics API
│   │   │   ├── nominas/             # Payroll data management
│   │   │   └── export-excel/        # Excel export functionality
│   │   ├── globals.css              # Global styles
│   │   ├── layout.tsx               # Root layout
│   │   └── page.tsx                 # Main application with memory dashboard
│   ├── components/
│   │   └── ui/                      # Shadcn/UI components
│   ├── lib/
│   │   ├── embeddings.ts            # Voyage AI embedding utilities
│   │   ├── memory-rag.ts            # RAG memory system
│   │   └── utils.ts                 # General utilities
│   └── types/
│       └── pdf-parse.d.ts           # Type definitions
├── public/                          # Static assets
└── env.example                      # Environment variables template
```

## API Endpoints

### POST /api/process-nomina
Enhanced payroll processing with Voyage RAG memory integration.

**Request**: 
```json
{
  "textContent": "extracted text from PDF",
  "documentId": "unique_document_id"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Nómina processed and saved successfully with RAG memory",
  "data": {
    "nominaId": "uuid",
    "processedData": { ... },
    "supabaseRecord": { ... },
    "ragContextUsed": true,
    "embeddingsStored": true,
    "memoryUpdated": true
  }
}
```

### GET /api/memory-status
Retrieve current Voyage AI-powered memory system status and analytics.

**Response**:
```json
{
  "success": true,
  "data": {
    "company_id": "uuid",
    "employee_id": "uuid",
    "memory_patterns": [...],
    "embedding_stats": [...],
    "processed_documents": [...],
    "recent_activity": [...],
    "summary": {
      "total_memories": 5,
      "total_embeddings": 47,
      "total_processed": 12,
      "avg_confidence": 0.78
    }
  }
}
```

## Voyage AI Benefits

### Cost Comparison
- **Voyage 3 Lite**: ~$0.10 per 1M tokens
- **OpenAI ada-002**: ~$0.10 per 1M tokens
- **Performance**: Voyage optimized for Claude = better results

### Technical Advantages
- **512D vectors**: Faster processing and less storage
- **Batch processing**: Up to 128 inputs per request
- **Input types**: Separate optimization for documents vs queries
- **Claude integration**: Built specifically for Anthropic models

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add tests if applicable
5. Update documentation
6. Submit a pull request

## License

[Your License Here]

## Support

For support, please open an issue in the GitHub repository or contact the development team.
