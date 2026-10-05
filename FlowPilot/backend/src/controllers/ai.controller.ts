import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { AIService } from '../services/ai.service';

export const generateQAScenarios = async (req: AuthRequest, res: Response) => {
  try {
    const { requirement } = req.body;

    if (!requirement || requirement.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Requirement text must be at least 5 characters long.',
      });
    }

    const result = await AIService.generateTestScenarios({ requirement });

    return res.status(200).json({
      success: true,
      message: 'QA Test scenarios generated successfully',
      data: result,
    });
  } catch (error) {
    console.error('AI QA generation error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error during AI processing' });
  }
};