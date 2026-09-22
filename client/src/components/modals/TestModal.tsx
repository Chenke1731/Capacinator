import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';

interface TestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TestModal: React.FC<TestModalProps> = ({ isOpen, onClose }) => {
  
  const handleClose = () => {
    // Give time for animation before calling onClose
    setTimeout(() => onClose(), 200);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Test Modal - Dialog Version</DialogTitle>
          <DialogDescription>
            A test modal to verify the dialog system is working correctly.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <h2 className="text-lg font-bold mb-2">
            Modal is Working!
          </h2>
          <p className="mb-5">
            If you can see this with a dark backdrop behind it, the modal system is working correctly.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={handleClose}>
            Close Modal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};