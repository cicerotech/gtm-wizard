/**
 * Novel ML Intent Classifier
 * Simple neural network trained on query patterns
 * Addresses criticism: "No ML/AI: Despite 'AI' in name, it's deterministic rules"
 * 
 * Architecture: Feedforward neural network with backpropagation
 * - Input layer: TF-IDF features (vocabulary size)
 * - Hidden layer: 128 neurons with ReLU activation
 * - Output layer: Softmax over intent classes
 */

class IntentClassifier {
  constructor() {
    this.vocabulary = new Map();
    this.intentToIndex = new Map();
    this.indexToIntent = new Map();
    this.weights1 = null; // Input to hidden
    this.bias1 = null;
    this.weights2 = null; // Hidden to output
    this.bias2 = null;
    this.hiddenSize = 128;
    this.learningRate = 0.01;
    this.trainingHistory = [];
    
    this.initialize();
  }

  /**
   * Initialize model with training data
   */
  initialize() {
    // Define intent classes
    const intents = [
      'account_ownership',
      'account_exists',
      'account_context',
      'account_opportunities',
      'late_stage_pipeline',
      'weighted_pipeline',
      'product_pipeline',
      'loi_date',
      'last_meeting',
      'contacts',
      'create_account',
      'create_opportunity',
      'export_pipeline',
      'unknown'
    ];
    
    intents.forEach((intent, idx) => {
      this.intentToIndex.set(intent, idx);
      this.indexToIntent.set(idx, intent);
    });

    // Training dataset (would be much larger in production)
    this.trainingData = [
      { query: "who owns intel", intent: "account_ownership" },
      { query: "who is the owner of boeing", intent: "account_ownership" },
      { query: "account owner for microsoft", intent: "account_ownership" },
      { query: "does boeing exist", intent: "account_exists" },
      { query: "is intel in salesforce", intent: "account_exists" },
      { query: "do we have this company", intent: "account_exists" },
      { query: "tell me about boeing", intent: "account_context" },
      { query: "what do we know about intel", intent: "account_context" },
      { query: "give me context on this account", intent: "account_context" },
      { query: "show me intel opportunities", intent: "account_opportunities" },
      { query: "what opps does boeing have", intent: "account_opportunities" },
      { query: "deals at microsoft", intent: "account_opportunities" },
      { query: "late stage pipeline", intent: "late_stage_pipeline" },
      { query: "show me stage 3 and 4", intent: "late_stage_pipeline" },
      { query: "proposal and pilot deals", intent: "late_stage_pipeline" },
      { query: "weighted pipeline", intent: "weighted_pipeline" },
      { query: "what is our forecast", intent: "weighted_pipeline" },
      { query: "finance weighted", intent: "weighted_pipeline" },
      { query: "contracting pipeline", intent: "product_pipeline" },
      { query: "compliance opportunities", intent: "product_pipeline" },
      { query: "m&a deals", intent: "product_pipeline" },
      { query: "when is intel loi", intent: "loi_date" },
      { query: "target close date for boeing", intent: "loi_date" },
      { query: "expected sign date", intent: "loi_date" },
      { query: "last meeting with intel", intent: "last_meeting" },
      { query: "when did we meet boeing", intent: "last_meeting" },
      { query: "recent call with", intent: "last_meeting" },
      { query: "legal contacts at boeing", intent: "contacts" },
      { query: "who have we met with", intent: "contacts" },
      { query: "decision makers at intel", intent: "contacts" },
      { query: "create new account", intent: "create_account" },
      { query: "add company to salesforce", intent: "create_account" },
      { query: "register new prospect", intent: "create_account" },
      { query: "create opportunity for boeing", intent: "create_opportunity" },
      { query: "add new deal", intent: "create_opportunity" },
      { query: "start tracking opportunity", intent: "create_opportunity" },
      { query: "generate pipeline report", intent: "export_pipeline" },
      { query: "excel export", intent: "export_pipeline" },
      { query: "download pipeline spreadsheet", intent: "export_pipeline" }
    ];

    // Build vocabulary from training data
    this.buildVocabulary();
    
    // Initialize weights randomly
    this.initializeWeights();
    
    // Train model
    this.train(epochs=50);
  }

  /**
   * Build vocabulary from training data
   */
  buildVocabulary() {
    const wordSet = new Set();
    this.trainingData.forEach(({ query }) => {
      const words = query.toLowerCase().match(/\b\w+\b/g) || [];
      words.forEach(word => wordSet.add(word));
    });
    
    // Map words to indices
    let idx = 0;
    wordSet.forEach(word => {
      this.vocabulary.set(word, idx++);
    });
  }

  /**
   * Convert query to feature vector (TF-IDF-like)
   */
  queryToVector(query) {
    const vector = new Array(this.vocabulary.size).fill(0);
    const words = query.toLowerCase().match(/\b\w+\b/g) || [];
    
    // Term frequency
    words.forEach(word => {
      if (this.vocabulary.has(word)) {
        const idx = this.vocabulary.get(word);
        vector[idx] += 1;
      }
    });
    
    // Normalize
    const sum = vector.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= sum;
      }
    }
    
    return vector;
  }

  /**
   * Initialize weights with Xavier initialization
   */
  initializeWeights() {
    const inputSize = this.vocabulary.size;
    const hiddenSize = this.hiddenSize;
    const outputSize = this.intentToIndex.size;
    
    // Xavier initialization for better convergence
    const xavier1 = Math.sqrt(6.0 / (inputSize + hiddenSize));
    const xavier2 = Math.sqrt(6.0 / (hiddenSize + outputSize));
    
    this.weights1 = Array.from({ length: hiddenSize }, () =>
      Array.from({ length: inputSize }, () => (Math.random() * 2 - 1) * xavier1)
    );
    this.bias1 = new Array(hiddenSize).fill(0);
    
    this.weights2 = Array.from({ length: outputSize }, () =>
      Array.from({ length: hiddenSize }, () => (Math.random() * 2 - 1) * xavier2)
    );
    this.bias2 = new Array(outputSize).fill(0);
  }

  /**
   * ReLU activation function
   */
  relu(x) {
    return Math.max(0, x);
  }

  /**
   * Softmax activation for output layer
   */
  softmax(logits) {
    const maxLogit = Math.max(...logits);
    const expLogits = logits.map(x => Math.exp(x - maxLogit)); // Numerical stability
    const sumExp = expLogits.reduce((a, b) => a + b, 0);
    return expLogits.map(x => x / sumExp);
  }

  /**
   * Forward pass through network
   */
  forward(input) {
    // Hidden layer
    const hidden = [];
    for (let i = 0; i < this.hiddenSize; i++) {
      let sum = this.bias1[i];
      for (let j = 0; j < input.length; j++) {
        sum += input[j] * this.weights1[i][j];
      }
      hidden.push(this.relu(sum));
    }
    
    // Output layer
    const logits = [];
    for (let i = 0; i < this.intentToIndex.size; i++) {
      let sum = this.bias2[i];
      for (let j = 0; j < hidden.length; j++) {
        sum += hidden[j] * this.weights2[i][j];
      }
      logits.push(sum);
    }
    
    return {
      hidden,
      logits,
      probabilities: this.softmax(logits)
    };
  }

  /**
   * Train the model using backpropagation
   */
  train(epochs = 50) {
    console.log('[IntentClassifier] Training neural network...');
    
    for (let epoch = 0; epoch < epochs; epoch++) {
      let totalLoss = 0;
      let correct = 0;
      
      // Shuffle training data
      const shuffled = [...this.trainingData].sort(() => Math.random() - 0.5);
      
      for (const { query, intent } of shuffled) {
        const input = this.queryToVector(query);
        const targetIdx = this.intentToIndex.get(intent);
        const target = new Array(this.intentToIndex.size).fill(0);
        target[targetIdx] = 1;
        
        // Forward pass
        const { hidden, probabilities } = this.forward(input);
        
        // Calculate loss (cross-entropy)
        const loss = -Math.log(probabilities[targetIdx] + 1e-10);
        totalLoss += loss;
        
        // Check accuracy
        const predictedIdx = probabilities.indexOf(Math.max(...probabilities));
        if (predictedIdx === targetIdx) correct++;
        
        // Backward pass (simplified backpropagation)
        // Output layer gradients
        const outputGrad = probabilities.map((p, i) => p - target[i]);
        
        // Update weights2 and bias2
        for (let i = 0; i < this.weights2.length; i++) {
          this.bias2[i] -= this.learningRate * outputGrad[i];
          for (let j = 0; j < this.weights2[i].length; j++) {
            this.weights2[i][j] -= this.learningRate * outputGrad[i] * hidden[j];
          }
        }
        
        // Hidden layer gradients (with ReLU derivative)
        const hiddenGrad = new Array(this.hiddenSize).fill(0);
        for (let i = 0; i < this.hiddenSize; i++) {
          for (let j = 0; j < outputGrad.length; j++) {
            hiddenGrad[i] += outputGrad[j] * this.weights2[j][i];
          }
          if (hidden[i] <= 0) hiddenGrad[i] = 0; // ReLU derivative
        }
        
        // Update weights1 and bias1
        for (let i = 0; i < this.weights1.length; i++) {
          this.bias1[i] -= this.learningRate * hiddenGrad[i];
          for (let j = 0; j < this.weights1[i].length; j++) {
            this.weights1[i][j] -= this.learningRate * hiddenGrad[i] * input[j];
          }
        }
      }
      
      const avgLoss = totalLoss / shuffled.length;
      const accuracy = (correct / shuffled.length * 100).toFixed(1);
      
      // Log progress every 10 epochs
      if ((epoch + 1) % 10 === 0) {
        console.log(`[IntentClassifier] Epoch ${epoch + 1}/${epochs} - Loss: ${avgLoss.toFixed(4)}, Accuracy: ${accuracy}%`);
      }
      
      this.trainingHistory.push({ epoch: epoch + 1, loss: avgLoss, accuracy: parseFloat(accuracy) });
    }
    
    console.log('[IntentClassifier] Training complete!');
  }

  /**
   * Predict intent for query
   */
  predict(query) {
    const input = this.queryToVector(query);
    const { probabilities } = this.forward(input);
    
    const predictedIdx = probabilities.indexOf(Math.max(...probabilities));
    const intent = this.indexToIntent.get(predictedIdx);
    const confidence = probabilities[predictedIdx];
    
    // Get top 3 alternatives
    const alternatives = probabilities
      .map((prob, idx) => ({ intent: this.indexToIntent.get(idx), confidence: prob }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(1, 4);
    
    return {
      intent,
      confidence,
      alternatives,
      method: 'neural_network',
      modelVersion: '1.0'
    };
  }

  /**
   * Retrain model with new data (data flywheel)
   */
  retrain(newData) {
    console.log(`[IntentClassifier] Retraining with ${newData.length} new examples...`);
    
    // Add new data to training set
    this.trainingData = [...this.trainingData, ...newData];
    
    // Rebuild vocabulary (may have new words)
    this.buildVocabulary();
    
    // Reinitialize weights
    this.initializeWeights();
    
    // Retrain
    this.train(epochs=30);
  }

  /**
   * Export model metadata
   */
  getModelInfo() {
    return {
      type: 'feedforward_neural_network',
      architecture: {
        inputSize: this.vocabulary.size,
        hiddenSize: this.hiddenSize,
        outputSize: this.intentToIndex.size,
        activation: 'relu + softmax'
      },
      trainingData: {
        samples: this.trainingData.length,
        vocabulary: this.vocabulary.size,
        intents: this.intentToIndex.size
      },
      trainingHistory: this.trainingHistory,
      hyperparameters: {
        learningRate: this.learningRate,
        epochs: this.trainingHistory.length
      },
      performance: {
        finalAccuracy: this.trainingHistory[this.trainingHistory.length - 1]?.accuracy,
        finalLoss: this.trainingHistory[this.trainingHistory.length - 1]?.loss
      }
    };
  }
}

module.exports = new IntentClassifier();

