// 📄 DÁN VÀO src/controllers/jobController.js
const Job = require('../models/Job');
const User = require('../models/User');
const Bid = require('../models/Bid');
const ipfsService = require('../config/ipfs');
const contractService = require('../services/blockchain/contractService');
const logger = require('../utils/logger');
const { normalizeAddress, toChecksumAddress } = require('../utils/address');
const { isDuplicateKeyError, applyBrowseRegistryScope } = require('../utils/jobScope');
const {
  buildCreateJobFields,
  reconcileJobAfterOnchainCreate,
  adoptOrMergeJob,
  normalizeAddr,
  canAdoptJobForClient,
  findJobForCreate,
} = require('../utils/jobReconcile');
const {
  applyBrowseStatusFilter,
  finalizeBrowseOpenListings,
} = require('../utils/browseJobs');

function resolveChainMetadata(onChainJob, requestMetadataCID) {
  if (!onChainJob) {
    return { chainMetadataCID: null, resolvedMetadataCID: requestMetadataCID || null };
  }
  const chainMetadataCID = onChainJob.metadataCID || onChainJob.jobMetadataCID || null;
  const resolvedMetadataCID = requestMetadataCID || chainMetadataCID;
  return { chainMetadataCID, resolvedMetadataCID };
}

async function adoptOrInsertJobAfterRace(reconcile, fields, jobId, clientAddress, onchainClientAddress) {
  const ownsOnChain = normalizeAddr(onchainClientAddress) === normalizeAddr(clientAddress);

  if (reconcile.job && ownsOnChain) {
    return adoptOrMergeJob(reconcile.job, fields);
  }
  if (reconcile.job) {
    return reconcile.job;
  }
  if (!ownsOnChain) {
    return null;
  }

  try {
    const job = new Job(fields);
    await job.save();
    return job;
  } catch (saveErr) {
    if (!isDuplicateKeyError(saveErr)) {
      throw saveErr;
    }
    const raced = await findJobForCreate(jobId);
    if (raced && canAdoptJobForClient(raced, clientAddress, onchainClientAddress)) {
      return adoptOrMergeJob(raced, fields);
    }
    return raced;
  }
}

/**
 * 📝 Job Controller
 * Xử lý các request liên quan đến công việc
 */
const jobController = {
  /**
   * GET /api/jobs
   * 📝 Lấy danh sách jobs với filter
   */
  getJobs: async (req, res) => {
    try {
      const { 
        page = 1, 
        limit = 20, 
        status, 
        category, 
        search,
        sortBy = 'createdAt',
        order = '-1'
      } = req.query;

      const skip = (page - 1) * limit;
      const extra = {};
      if (category) extra.category = category;
      if (search) {
        extra.$text = { $search: search };
      }
      const query = applyBrowseStatusFilter(applyBrowseRegistryScope(extra), status);

      // Sort
      const sort = {};
      sort[sortBy] = parseInt(order);

      const jobsRaw = await Job.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('client', 'walletAddress username profile.fullName reputation');

      const jobs = await finalizeBrowseOpenListings(jobsRaw, status, contractService);

      const total = await Job.countDocuments(query);

      res.json({
        success: true,
        jobs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Get jobs error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * GET /api/jobs/search
   * 📝 Tìm kiếm jobs theo từ khóa
   */
  searchJobs: async (req, res) => {
    try {
      const { q, category, minBudget, maxBudget, status } = req.query;
      
      const extra = {};
      if (q) {
        extra.$text = { $search: q };
      }
      if (category) extra.category = category;
      if (minBudget) extra.contractValue = { $gte: parseInt(minBudget) };
      if (maxBudget) {
        extra.contractValue = {
          ...extra.contractValue,
          $lte: parseInt(maxBudget),
        };
      }

      const requestedStatus = status ? String(status).toUpperCase() : null;
      const query = applyBrowseStatusFilter(applyBrowseRegistryScope(extra), requestedStatus);

      const jobsRaw = await Job.find(query)
        .sort(q ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
        .limit(50)
        .populate('client', 'walletAddress username profile.fullName reputation');

      const jobs = await finalizeBrowseOpenListings(jobsRaw, requestedStatus, contractService);

      res.json({
        success: true,
        jobs,
        count: jobs.length
      });
    } catch (error) {
      logger.error('Search jobs error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * GET /api/jobs/client/:address
   * 📝 Lấy jobs của một client
   */
  getJobsByClient: async (req, res) => {
    try {
      const { address } = req.params;
      const { status } = req.query;

      const query = { 
        clientAddress: address.toLowerCase(),
        isActive: true 
      };
      if (status) query.status = status;

      const jobs = await Job.find(query)
        .sort({ createdAt: -1 })
        .populate('freelancer', 'walletAddress username profile.fullName');

      res.json({
        success: true,
        jobs,
        count: jobs.length
      });
    } catch (error) {
      logger.error('Get jobs by client error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * GET /api/jobs/freelancer/:address
   * 📝 Lấy jobs của một freelancer
   */
  getJobsByFreelancer: async (req, res) => {
    try {
      const { address } = req.params;
      const { status } = req.query;

      const query = { 
        freelancerAddress: address.toLowerCase(),
        isActive: true 
      };
      if (status) query.status = status;

      const jobs = await Job.find(query)
        .sort({ createdAt: -1 })
        .populate('client', 'walletAddress username profile.fullName');

      res.json({
        success: true,
        jobs,
        count: jobs.length
      });
    } catch (error) {
      logger.error('Get jobs by freelancer error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * GET /api/jobs/:id/onchain-debug
   * Full chain state + staticCall preflight for support.
   */
  getOnchainDebug: async (req, res) => {
    try {
      const job = await Job.findById(req.params.id);
      if (!job) {
        return res.status(404).json({ success: false, error: 'Job not found' });
      }

      if (!contractService.isValidOnchainJobId(job.onchainJobId)) {
        return res.status(400).json({
          success: false,
          error: 'Job has no valid on-chain id',
        });
      }

      const freelancerAddress =
        req.query.freelancerAddress ||
        job.freelancerAddress ||
        job.onchainFreelancerAddress ||
        null;

      const debug = await contractService.getOnchainDebug(
        job.onchainJobId,
        freelancerAddress ? normalizeAddress(freelancerAddress) : null,
      );

      res.json({
        success: true,
        mongoJobId: job._id.toString(),
        mongoStatus: job.status,
        onchainJobId: job.onchainJobId,
        debug,
      });
    } catch (error) {
      logger.error('Onchain debug error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /api/jobs/:id
   * 📝 Lấy chi tiết job theo ID
   */
  getJobById: async (req, res) => {
    try {
      const job = await Job.findById(req.params.id)
        .populate('client', 'walletAddress username profile.fullName profile.avatar reputation')
        .populate('freelancer', 'walletAddress username profile.fullName profile.avatar reputation')
        .populate('bids')
        .populate('clientReview')
        .populate('freelancerReview');

      if (!job) {
        return res.status(404).json({ 
          success: false, 
          error: 'Job not found' 
        });
      }

      // Lấy metadata từ IPFS
      let metadata = null;
      try {
        metadata = await job.getMetadata();
      } catch (error) {
        logger.warn('Cannot fetch metadata from IPFS:', error.message);
      }

      let onchain = null;
      if (contractService.isValidOnchainJobId(job.onchainJobId)) {
        try {
          onchain = await contractService.getOnchainJobView(job.onchainJobId);
        } catch (chainErr) {
          logger.warn(`Cannot read on-chain job ${job.onchainJobId}:`, chainErr.message);
        }
      }

      if (
        onchain?.onchainStatus &&
        contractService.isChainStatusAhead(onchain.onchainStatus, job.status)
      ) {
        try {
          await job.updateStatus(onchain.onchainStatus, 'onchain_reconcile', '');
          if (onchain.deliverableCID) {
            job.deliverableCID = onchain.deliverableCID;
          }
          await job.save();
          logger.info(
            `Job ${job.onchainJobId} reconciled ${job.status} → ${onchain.onchainStatus} from chain read`,
          );
        } catch (reconcileErr) {
          logger.warn(`On-chain reconcile failed for job ${job.onchainJobId}:`, reconcileErr.message);
        }
      }

      const jobJson = job.toObject();
      if (onchain) {
        jobJson.onchainStatus = onchain.onchainStatus;
        jobJson.onchainFreelancerAddress = onchain.onchainFreelancerAddress;
        if (onchain.onchainClientAddress) {
          jobJson.onchainClientAddress = onchain.onchainClientAddress;
        }
        if (onchain.deliverableCID) {
          jobJson.deliverableCID = onchain.deliverableCID;
        }
        jobJson.status = job.status;
      }

      res.json({
        success: true,
        job: jobJson,
        metadata,
        onchain,
      });
    } catch (error) {
      logger.error('Get job by id error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  /**
   * POST /api/jobs
   * 📝 Tạo job mới
   */
  createJob: async (req, res) => {
    try {
      const { 
        title, 
        description, 
        category, 
        contractValue, 
        duration, 
        skills, 
        deliverables, 
        acceptanceCriteria,
        onchainJobId,
        metadataCID,
        createTxHash,
        relayCreateJob,
      } = req.body;
      
      const clientAddress = req.user?.walletAddress;

      if (!clientAddress) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // 1. Check user tier
      const user = await User.findOne({ walletAddress: clientAddress });
      if (!user || user.reputation.tier === 'Restricted') {
        return res.status(403).json({ 
          success: false, 
          error: 'Restricted users cannot create jobs' 
        });
      }

      const relayEnabled = process.env.RELAY_CREATE_JOB === 'true';
      const relayRequested = relayCreateJob === true;

      if (relayRequested && !relayEnabled) {
        return res.status(400).json({
          success: false,
          code: 'RELAY_CREATE_JOB_DISABLED',
          error: 'Relayed createJob is disabled on this API',
          hint:
            'Set RELAY_CREATE_JOB=true on the backend (and INDEXER_PRIVATE_KEY), or sign createJob from MetaMask.',
        });
      }

      // Demo fallback: INDEXER wallet relays JobRegistry.createJob (on-chain client ≠ API client).
      if (relayRequested && relayEnabled && (onchainJobId == null || onchainJobId === '')) {
        if (!metadataCID) {
          return res.status(400).json({
            success: false,
            code: 'METADATA_CID_REQUIRED',
            error: 'metadataCID is required (upload to IPFS before relayed createJob)',
          });
        }

        let relayJobId;
        try {
          relayJobId = await contractService.createJob(
            clientAddress,
            metadataCID,
            contractValue,
            duration,
          );
        } catch (contractError) {
          logger.error('Relay createJob failed', contractError);
          return res.status(503).json({
            success: false,
            error: contractError.message || 'On-chain job registration failed',
            code: 'ONCHAIN_JOB_CREATE_FAILED',
            hint:
              'Set RPC_URL and INDEXER_PRIVATE_KEY on the backend. Escrow/deposit later requires the INDEXER wallet as on-chain client.',
          });
        }

        if (!contractService.isValidOnchainJobId(relayJobId)) {
          return res.status(503).json({
            success: false,
            code: 'ONCHAIN_JOB_ID_INVALID',
            error: `Invalid on-chain job id: ${relayJobId}`,
          });
        }

        const onChainJob = await contractService.getJob(relayJobId);
        const onchainClientAddress = onChainJob?.client?.toLowerCase?.() || null;
        const deadline = Math.floor(Date.now() / 1000) + duration;
        const metadataResult = { cid: metadataCID };

        const fields = buildCreateJobFields({
          jobId: relayJobId,
          clientAddress,
          onchainClientAddress,
          metadataResult,
          title,
          description,
          category,
          skills,
          contractValue,
          duration,
          deadline,
          onChainJob,
        });

        const reconcile = await reconcileJobAfterOnchainCreate(
          relayJobId,
          clientAddress,
          fields,
          onchainClientAddress,
        );

        if (reconcile.action === 'collision' || reconcile.action === 'duplicate') {
          if (reconcile.job?.clientAddress === clientAddress) {
            return res.status(200).json({
              success: true,
              message: 'Job already registered (relay)',
              jobId: relayJobId,
              onchainJobId: relayJobId,
              onchainClientAddress: onChainJob?.client,
              metadataCID,
              relayed: true,
              job: reconcile.job,
            });
          }
          return res.status(409).json({
            success: false,
            code: 'ONCHAIN_JOB_ID_COLLISION',
            error: `On-chain job id ${relayJobId} already used in MongoDB.`,
          });
        }

        if (reconcile.action === 'created') {
          user.stats.jobsPosted += 1;
          await user.save();
        }

        return res.status(reconcile.action === 'reconciled' ? 200 : 201).json({
          success: true,
          message:
            reconcile.action === 'reconciled'
              ? 'Job linked (relay / recovered)'
              : 'Job created via INDEXER relay (demo mode)',
          jobId: relayJobId,
          onchainJobId: relayJobId,
          onchainClientAddress: onChainJob?.client,
          metadataCID,
          relayed: true,
          demoMode: true,
          hint:
            'On-chain client is the INDEXER wallet — escrow deposit must use that wallet, not the API SIWE wallet.',
          job: reconcile.job,
        });
      }

      // 2. Client must register an on-chain job id (JobRegistry.createJob signed from their wallet)
      if (onchainJobId == null || onchainJobId === '') {
        return res.status(400).json({
          success: false,
          code: 'ONCHAIN_JOB_ID_REQUIRED',
          error: 'onchainJobId is required',
          hint:
            'Call JobRegistry.createJob(metadataCID, value, duration) from your MetaMask wallet, then POST the returned job id with this metadata.',
        });
      }

      if (!contractService.isValidOnchainJobId(onchainJobId)) {
        return res.status(400).json({
          success: false,
          code: 'ONCHAIN_JOB_ID_INVALID',
          error: `Invalid on-chain job id: ${onchainJobId}`,
        });
      }

      let onChainJob;
      try {
        onChainJob = await contractService.getJob(onchainJobId);
      } catch (chainReadError) {
        logger.error('getJob failed during createJob register', chainReadError);
        return res.status(503).json({
          success: false,
          code: 'ONCHAIN_JOB_READ_FAILED',
          error: chainReadError.message || 'Could not read job from JobRegistry',
          hint: 'Set RPC_URL on the backend and ensure the job exists on the deployed JobRegistry.',
        });
      }

      const onchainClientAddress = onChainJob?.client?.toLowerCase?.() || null;
      if (!onchainClientAddress) {
        return res.status(404).json({
          success: false,
          code: 'ONCHAIN_JOB_NOT_FOUND',
          error: `Job ${onchainJobId} not found on JobRegistry`,
        });
      }

      if (onchainClientAddress !== clientAddress.toLowerCase()) {
        return res.status(403).json({
          success: false,
          code: 'ONCHAIN_CLIENT_MISMATCH',
          error: 'On-chain job client must match your signed-in wallet',
          hint:
            `JobRegistry lists client ${onChainJob.client}. Create jobs from the same wallet you used for SIWE sign-in.`,
          onchainClientAddress: onChainJob.client,
        });
      }

      const { toUsdcUnits } = require('../utils/usdc');
      const expectedValueUnits = toUsdcUnits(contractValue);
      if (Number(onChainJob.contractValue) !== expectedValueUnits) {
        return res.status(400).json({
          success: false,
          code: 'ONCHAIN_VALUE_MISMATCH',
          error: 'On-chain contractValue does not match the submitted budget',
          hint: `Registry value is ${onChainJob.contractValue} smallest units; API sent ${expectedValueUnits}.`,
        });
      }

      const chainMetadataCID = onChainJob?.metadataCID || onChainJob?.jobMetadataCID || null;
      const resolvedMetadataCID = metadataCID || chainMetadataCID;
      if (!resolvedMetadataCID) {
        return res.status(400).json({
          success: false,
          code: 'METADATA_CID_REQUIRED',
          error: 'metadataCID is required (upload to IPFS before createJob on-chain)',
        });
      }
      if (chainMetadataCID && metadataCID && chainMetadataCID !== metadataCID) {
        return res.status(400).json({
          success: false,
          code: 'METADATA_CID_MISMATCH',
          error: 'metadataCID does not match JobRegistry.jobMetadataCID',
        });
      }

      const metadata = {
        title,
        description,
        category,
        skills,
        deliverables,
        acceptanceCriteria,
        clientAddress,
        createdAt: new Date().toISOString(),
      };

      // Re-upload only when the client did not pass a CID already pinned on-chain.
      const metadataResult = metadataCID
        ? { cid: metadataCID }
        : await ipfsService.uploadJSON(metadata);

      const jobId = Number(onchainJobId);
      const deadline = Math.floor(Date.now() / 1000) + duration;

      const fields = buildCreateJobFields({
        jobId,
        clientAddress,
        onchainClientAddress,
        metadataResult,
        title,
        description,
        category,
        skills,
        contractValue,
        duration,
        deadline,
        onChainJob,
      });

      const reconcile = await reconcileJobAfterOnchainCreate(
        jobId,
        clientAddress,
        fields,
        onchainClientAddress,
      );

      if (reconcile.action === 'collision' || reconcile.action === 'duplicate') {
        if (
          reconcile.job?.clientAddress === clientAddress ||
          normalizeAddr(onchainClientAddress) === normalizeAddr(clientAddress)
        ) {
          const adopted = await adoptOrInsertJobAfterRace(
            reconcile,
            fields,
            jobId,
            clientAddress,
            onchainClientAddress,
          );
          if (!adopted) {
            return res.status(409).json({
              success: false,
              code: 'ONCHAIN_JOB_ID_COLLISION',
              error: `On-chain job id ${jobId} could not be linked to your account.`,
              onchainJobId: jobId,
              hint:
                'Use POST /api/jobs/sync-onchain with the same metadata to adopt the MongoDB row.',
            });
          }
          return res.status(200).json({
            success: true,
            message: 'Job already registered for this wallet',
            jobId,
            onchainJobId: jobId,
            onchainClientAddress,
            metadataCID: adopted.metadataCID || resolvedMetadataCID,
            job: adopted,
            reconciled: true,
          });
        }
        return res.status(409).json({
          success: false,
          code: 'ONCHAIN_JOB_ID_COLLISION',
          error: `On-chain job id ${jobId} is already used in the database for this JobRegistry deployment.`,
          onchainJobId: jobId,
          hint:
            'If you own this job on-chain, use POST /api/jobs/sync-onchain with the same metadata to adopt the MongoDB row. ' +
            'If JobRegistry was redeployed, run scripts/migrate-job-registry-index.js with LEGACY_JOB_REGISTRY_ADDRESS.',
        });
      }

      const job = reconcile.job;
      const createdFresh = reconcile.action === 'created';

      // 5. Update user stats (only when this API call newly registered the job)
      if (createdFresh) {
        user.stats.jobsPosted += 1;
        await user.save();
      }

      const statusCode = reconcile.action === 'reconciled' ? 200 : 201;
      res.status(statusCode).json({
        success: true,
        message:
          reconcile.action === 'reconciled'
            ? 'Job linked to your account (recovered from indexer or prior attempt)'
            : 'Job created successfully',
        jobId: jobId,
        onchainJobId: jobId,
        onchainClientAddress,
        metadataCID: metadataResult.cid,
        reconciled: reconcile.action === 'reconciled',
        job,
      });

    } catch (error) {
      logger.error('Create job error:', error);
      if (isDuplicateKeyError(error)) {
        return res.status(409).json({
          success: false,
          code: 'ONCHAIN_JOB_ID_COLLISION',
          error: 'This on-chain job id already exists for the current JobRegistry in MongoDB.',
          hint:
            'A concurrent indexer write may have won the race. Retry createJob — the server should reconcile automatically. ' +
            'If this persists, run scripts/migrate-job-registry-index.js or contact support.',
        });
      }
      const message = /metadataCID/i.test(error.message)
        ? 'Could not register job metadata — upload to IPFS again and retry, or use Sync on-chain job.'
        : error.message;
      res.status(500).json({
        success: false,
        error: message,
      });
    }
  },

  /**
   * POST /api/jobs/sync-onchain
   * Adopt/reconcile a MongoDB row after the user already called createJob on-chain.
   */
  syncOnchainJob: async (req, res) => {
    try {
      const {
        title,
        description,
        category,
        contractValue,
        duration,
        skills,
        deliverables,
        acceptanceCriteria,
        onchainJobId,
        metadataCID,
      } = req.body;

      const clientAddress = req.user?.walletAddress;
      if (!clientAddress) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      if (onchainJobId == null || onchainJobId === '') {
        return res.status(400).json({
          success: false,
          code: 'ONCHAIN_JOB_ID_REQUIRED',
          error: 'onchainJobId is required',
        });
      }

      if (!contractService.isValidOnchainJobId(onchainJobId)) {
        return res.status(400).json({
          success: false,
          code: 'ONCHAIN_JOB_ID_INVALID',
          error: `Invalid on-chain job id: ${onchainJobId}`,
        });
      }

      let onChainJob;
      try {
        onChainJob = await contractService.getJob(onchainJobId);
      } catch (chainReadError) {
        logger.error('getJob failed during sync-onchain', chainReadError);
        return res.status(503).json({
          success: false,
          code: 'ONCHAIN_JOB_READ_FAILED',
          error: chainReadError.message || 'Could not read job from JobRegistry',
        });
      }

      const onchainClientAddress = onChainJob?.client?.toLowerCase?.() || null;
      if (!onchainClientAddress) {
        return res.status(404).json({
          success: false,
          code: 'ONCHAIN_JOB_NOT_FOUND',
          error: `Job ${onchainJobId} not found on JobRegistry`,
        });
      }

      if (onchainClientAddress !== clientAddress.toLowerCase()) {
        return res.status(403).json({
          success: false,
          code: 'ONCHAIN_CLIENT_MISMATCH',
          error: 'On-chain job client must match your signed-in wallet',
          onchainClientAddress: onChainJob.client,
        });
      }

      const chainMetadataCID = onChainJob?.metadataCID || onChainJob?.jobMetadataCID || null;
      const resolvedMetadataCID = metadataCID || chainMetadataCID;
      if (!resolvedMetadataCID) {
        return res.status(400).json({
          success: false,
          code: 'METADATA_CID_REQUIRED',
          error: 'metadataCID is required',
        });
      }

      const jobId = Number(onchainJobId);
      const deadline = Math.floor(Date.now() / 1000) + (duration || 86400);

      const fields = buildCreateJobFields({
        jobId,
        clientAddress,
        onchainClientAddress,
        metadataResult: { cid: resolvedMetadataCID },
        title,
        description,
        category,
        skills,
        contractValue: contractValue || 0,
        duration: duration || 86400,
        deadline,
        onChainJob,
      });

      const reconcile = await reconcileJobAfterOnchainCreate(
        jobId,
        clientAddress,
        fields,
        onchainClientAddress,
      );

      if (reconcile.action === 'collision' || reconcile.action === 'duplicate') {
        if (
          reconcile.job &&
          !canAdoptJobForClient(reconcile.job, clientAddress, onchainClientAddress)
        ) {
          return res.status(409).json({
            success: false,
            code: 'ONCHAIN_JOB_ID_COLLISION',
            error: `On-chain job id ${jobId} belongs to another account in MongoDB.`,
            onchainJobId: jobId,
            hint:
              'If JobRegistry was redeployed, run scripts/migrate-job-registry-index.js with LEGACY_JOB_REGISTRY_ADDRESS.',
          });
        }

        const job = await adoptOrInsertJobAfterRace(
          reconcile,
          fields,
          jobId,
          clientAddress,
          onchainClientAddress,
        );
        if (!job) {
          return res.status(409).json({
            success: false,
            code: 'ONCHAIN_JOB_ID_COLLISION',
            error: `On-chain job id ${jobId} could not be synced to your account.`,
            onchainJobId: jobId,
            hint: 'Retry sync-onchain or contact support if you own this job on-chain.',
          });
        }

        return res.status(200).json({
          success: true,
          message: 'Job synced from on-chain state',
          jobId,
          onchainJobId: jobId,
          onchainClientAddress,
          metadataCID: job.metadataCID || resolvedMetadataCID,
          reconciled: true,
          job,
        });
      }

      if (!reconcile.job) {
        return res.status(500).json({
          success: false,
          code: 'JOB_SYNC_FAILED',
          error: 'Job reconcile succeeded but no MongoDB row was returned.',
          hint: 'Retry sync-onchain or POST /api/jobs with the same onchainJobId.',
        });
      }

      const statusCode = reconcile.action === 'created' ? 201 : 200;
      return res.status(statusCode).json({
        success: true,
        message:
          reconcile.action === 'created'
            ? 'Job registered from on-chain state'
            : 'Job linked to your account',
        jobId,
        onchainJobId: jobId,
        onchainClientAddress,
        metadataCID: resolvedMetadataCID,
        reconciled: reconcile.action === 'reconciled',
        job: reconcile.job,
      });
    } catch (error) {
      logger.error('Sync onchain job error:', error);
      const message = /metadataCID/i.test(error.message)
        ? 'Could not link job metadata — re-upload IPFS metadata and retry sync-onchain.'
        : error.message;
      res.status(500).json({ success: false, error: message });
    }
  },

  /**
   * POST /api/jobs/:id/assign-freelancer
   * Legacy relay — only works when INDEXER wallet is still the on-chain client (old jobs).
   * New flow: depositEscrow from the client wallet assigns the freelancer on-chain.
   */
  assignFreelancer: async (req, res) => {
    try {
      const { id } = req.params;
      const { freelancerAddress } = req.body;
      const user = req.user;

      const job = await Job.findById(id);
      if (!job) {
        return res.status(404).json({ success: false, error: 'Job not found' });
      }
      if (job.clientAddress !== user.walletAddress) {
        return res.status(403).json({ success: false, error: 'Only client can assign freelancer' });
      }
      if (!freelancerAddress) {
        return res.status(400).json({ success: false, error: 'freelancerAddress is required' });
      }
      if (!contractService.isValidOnchainJobId(job.onchainJobId)) {
        return res.status(400).json({ success: false, error: 'Job has no valid on-chain id' });
      }

      const result = await contractService.assignFreelancer(
        job.onchainJobId,
        normalizeAddress(freelancerAddress)
      );

      job.freelancerAddress = normalizeAddress(freelancerAddress);
      await job.save();
      await job.updateStatus(
        'ASSIGNED',
        `Freelancer ${freelancerAddress} assigned on-chain`,
        result.hash
      );

      res.json({
        success: true,
        message: 'Freelancer assigned on-chain',
        assignTxHash: result.hash,
        job,
      });
    } catch (error) {
      logger.error('Assign freelancer error:', error);
      res.status(503).json({
        success: false,
        error: error.message,
        code: 'ONCHAIN_ASSIGN_FAILED',
      });
    }
  },

  /**
   * PATCH /api/jobs/:id/status
   * 📝 Cập nhật trạng thái job
   */
  updateJobStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status, note } = req.body;
      const user = req.user;

      const job = await Job.findById(id);
      if (!job) {
        return res.status(404).json({ 
          success: false, 
          error: 'Job not found' 
        });
      }

      // Check authorization
      if (job.clientAddress !== user.walletAddress) {
        return res.status(403).json({ 
          success: false, 
          error: 'Only client can update job status' 
        });
      }

      await job.updateStatus(status, note);

      res.json({
        success: true,
        message: 'Job status updated',
        job
      });

    } catch (error) {
      logger.error('Update job status error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
};

module.exports = jobController;